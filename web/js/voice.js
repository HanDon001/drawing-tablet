/**
 * VC.Voice - 实时流式语音服务
 * WebSocket ASR (DashScope Realtime) + Barge-in 打断 + VAD
 * 降级: HTTP ASR → Web Speech API
 */
(function() {
    'use strict';

    let mediaStream = null;
    let audioCtx = null;
    let workletNode = null;
    let ws = null;
    let recognition = null;

    // 重连
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const BACKOFF_MS = 1000;
    let reconnectTimer = null;

    // Barge-in
    let isSpeaking = false;
    let currentAudio = null;

    // PCM 缓存（降级用）
    let pcmChunks = [];

    VC.Voice = {
        /**
         * 初始化语音服务
         */
        async init() {
            await this._checkBackend();
            console.log('[Voice] 语音服务初始化完成, 后端:', VC.State.backendAvailable ? '可用' : '不可用');
        },

        /**
         * 检测后端可用性
         */
        async _checkBackend() {
            try {
                const resp = await fetch(VC.Config.API_BASE + '/health', {
                    signal: AbortSignal.timeout(3000)
                });
                VC.State.backendAvailable = resp.ok;
            } catch (e) {
                VC.State.backendAvailable = false;
            }
        },

        /**
         * 开始录音（实时 ASR）
         */
        async startRecording() {
            pcmChunks = [];
            retryCount = 0;

            try {
                // 获取麦克风
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
                });

                // 连接 WebSocket
                await this._connectWebSocket();

                // 启动音频捕获（VAD）
                await this._startAudioCapture();

                // 发送 start 指令
                ws.send(JSON.stringify({
                    action: 'start',
                    task_id: `asr-${Date.now()}`,
                    config: { parameters: { format: 'pcm', sample_rate: 16000 } }
                }));

                VC.State.setVoiceState('recording');
                console.log('[Voice] 实时 ASR 已启动');

            } catch (e) {
                console.error('[Voice] 启动失败，降级到 Web Speech API:', e);
                VC.State.setVoiceState('idle');
                this._fallbackToWebSpeech();
            }
        },

        /**
         * 停止录音
         */
        stopRecording() {
            // 发送 stop 指令
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'stop' }));
            }

            this._stopAudioCapture();

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            VC.State.setVoiceState('idle');
            console.log('[Voice] ASR 已停止');
        },

        /**
         * Barge-in: 用户打断 TTS
         */
        _onSpeechDetected() {
            if (isSpeaking) {
                console.log('[Voice] Barge-in: 用户打断');
                currentAudio?.pause();
                currentAudio = null;
                isSpeaking = false;
                window.speechSynthesis?.cancel();
            }
        },

        /**
         * 连接 DashScope ASR WebSocket（自动重连）
         */
        _connectWebSocket() {
            return new Promise((resolve, reject) => {
                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${location.host}/ai/v1/voice/asr/ws`;

                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[Voice] WebSocket 已连接');
                    retryCount = 0;
                    resolve();
                };

                ws.onerror = (e) => {
                    console.error('[Voice] WebSocket 错误:', e);
                    reject(new Error('连接失败'));
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        switch (msg.type) {
                            case 'status':
                                if (msg.status === 'started') {
                                    VC.State.setVoiceState('recording');
                                }
                                break;

                            case 'result':
                                if (msg.is_final) {
                                    this._onFinalResult(msg.text);
                                } else {
                                    this._onPartialResult(msg.text);
                                }
                                break;

                            case 'error':
                                console.error('[Voice] ASR 错误:', msg.message);
                                break;
                        }
                    } catch { /* 忽略非 JSON */ }
                };

                ws.onclose = (e) => {
                    console.log(`[Voice] WebSocket 关闭 (code=${e.code})`);

                    // 自动重连
                    if (e.code !== 1000 && retryCount < MAX_RETRIES && VC.State.voiceState === 'recording') {
                        const delay = BACKOFF_MS * Math.pow(2, retryCount);
                        console.warn(`[Voice] ${delay}ms 后重连 (${retryCount + 1}/${MAX_RETRIES})`);
                        reconnectTimer = setTimeout(async () => {
                            retryCount++;
                            try {
                                await this._connectWebSocket();
                                ws.send(JSON.stringify({ action: 'start', task_id: `asr-${Date.now()}` }));
                            } catch {
                                this._fallbackToHttpASR();
                            }
                        }, delay);
                    } else if (VC.State.voiceState === 'recording') {
                        this._fallbackToHttpASR();
                    }
                };
            });
        },

        /**
         * 启动音频捕获（VAD）
         */
        async _startAudioCapture() {
            audioCtx = new AudioContext({ sampleRate: 16000 });
            await audioCtx.audioWorklet.addModule('/vad-processor.js');

            const source = audioCtx.createMediaStreamSource(mediaStream);
            workletNode = new AudioWorkletNode(audioCtx, 'vad-processor');

            workletNode.port.onmessage = (event) => {
                const { type, data } = event.data;

                if (type === 'audio') {
                    // 检测到语音 → Barge-in
                    this._onSpeechDetected();

                    const int16 = new Int16Array(data);
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(int16.buffer);
                    }
                    // 缓存（降级用）
                    pcmChunks.push(new Float32Array(data));
                }

                if (type === 'silence') {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ action: 'stop' }));
                    }
                }
            };

            source.connect(workletNode);
            workletNode.connect(audioCtx.destination);
        },

        /**
         * 停止音频捕获
         */
        _stopAudioCapture() {
            workletNode?.disconnect();
            workletNode = null;
            audioCtx?.close();
            audioCtx = null;
            mediaStream?.getTracks().forEach(t => t.stop());
            mediaStream = null;
        },

        /**
         * 增量识别结果（普通模式：只显示，不执行）
         */
        _onPartialResult(text) {
            VC.State.emit('recognized', { text, isFinal: false });
        },

        /**
         * 最终识别结果（普通模式：说完才执行）
         */
        _onFinalResult(text) {
            console.log('[Voice] ASR 最终结果:', text);
            VC.State.setVoiceState('idle');
            VC.State.emit('recognized', { text, isFinal: true });
        },

        /**
         * 语音播报（带 Barge-in 支持）
         */
        async speak(text) {
            isSpeaking = true;

            try {
                // 先尝试 MiMo TTS
                if (VC.State.backendAvailable) {
                    const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, voice: 'Chloe' })
                    });

                    if (resp.ok) {
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        currentAudio = new Audio(url);

                        await new Promise((resolve) => {
                            currentAudio.onended = () => {
                                URL.revokeObjectURL(url);
                                currentAudio = null;
                                resolve();
                            };
                            currentAudio.onerror = () => {
                                URL.revokeObjectURL(url);
                                currentAudio = null;
                                resolve();
                            };
                            currentAudio.play().catch(() => resolve());
                        });
                        return;
                    }
                }
            } catch (e) {
                console.warn('[Voice] TTS 失败，降级浏览器 TTS:', e);
            }

            // 降级：浏览器原生 TTS
            this._speakFallback(text);
        },

        /**
         * 浏览器原生 TTS
         */
        _speakFallback(text) {
            return new Promise((resolve) => {
                if (!window.speechSynthesis) { resolve(); return; }
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'zh-CN';
                u.onend = () => resolve();
                u.onerror = resolve;
                window.speechSynthesis.speak(u);
            });
        },

        /**
         * HTTP ASR 降级
         */
        async _fallbackToHttpASR() {
            console.warn('[Voice] 降级到 HTTP ASR');
            if (pcmChunks.length === 0) return;

            // 合并 PCM → WAV
            const totalLen = pcmChunks.reduce((s, c) => s + c.length, 0);
            const merged = new Float32Array(totalLen);
            let off = 0;
            for (const chunk of pcmChunks) { merged.set(chunk, off); off += chunk.length }
            pcmChunks = [];

            const wavBuf = this._encodeWAV(merged, audioCtx?.sampleRate || 16000);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(wavBuf)));

            try {
                const resp = await fetch(VC.Config.API_BASE + '/voice/asr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ audio_data: base64, mime_type: 'audio/wav', language: 'auto' })
                });
                const data = await resp.json();
                if (data.text) this._onFinalResult(data.text);
            } catch (e) {
                console.error('[Voice] HTTP ASR 也失败:', e);
                this._fallbackToWebSpeech();
            }
        },

        /**
         * Web Speech API 降级
         */
        _fallbackToWebSpeech() {
            if (!('webkitSpeechRecognition' in window)) {
                VC.Log.add('system', '⚠️ 浏览器不支持语音识别');
                return;
            }

            console.log('[Voice] 降级到 Web Speech API');
            recognition = new webkitSpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onresult = (e) => {
                const text = e.results[0][0].transcript;
                const isFinal = e.results[0].isFinal;
                if (isFinal) {
                    this._onFinalResult(text);
                } else {
                    this._onPartialResult(text);
                }
            };

            recognition.onend = () => {
                VC.State.setVoiceState('idle');
            };

            recognition.onerror = () => {
                VC.State.setVoiceState('idle');
            };

            recognition.start();
            VC.State.setVoiceState('recording');
        },

        /**
         * PCM → WAV 编码
         */
        _encodeWAV(samples, sampleRate) {
            const bps = 16, ch = 1;
            const dataSize = samples.length * (bps / 8);
            const buf = new ArrayBuffer(44 + dataSize);
            const v = new DataView(buf);
            const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) };
            ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE');
            ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
            v.setUint16(22, ch, true); v.setUint32(24, sampleRate, true);
            v.setUint32(28, sampleRate * ch * bps / 8, true); v.setUint16(32, ch * bps / 8, true);
            v.setUint16(34, bps, true); ws(36, 'data'); v.setUint32(40, dataSize, true);
            let o = 44;
            for (let i = 0; i < samples.length; i++) {
                const s = Math.max(-1, Math.min(1, samples[i]));
                v.setInt16(o, s * (s < 0 ? 0x8000 : 0x7FFF), true); o += 2;
            }
            return buf;
        }
    };

    console.log('[Voice] 语音模块加载完成');
})();
