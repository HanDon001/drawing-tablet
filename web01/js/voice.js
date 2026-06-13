/**
 * VC.Voice - 语音服务 (VAD 模式)
 * 点击一次 → VAD 自动检测语音 → 说完自动停止 → ASR
 */
(function() {
    'use strict';

    let audioCtx = null;
    let workletNode = null;
    let mediaStream = null;
    let pcmChunks = [];       // 收集 Float32 音频帧
    let isListening = false;

    const SAMPLE_RATE = 16000;

    VC.Voice = {
        async init() {
            await this._checkBackend();
            console.log(`[Voice] 初始化完成, 后端: ${VC.State.backendAvailable ? '可用' : '不可用'}`);
        },

        async _checkBackend() {
            try {
                const resp = await fetch(VC.Config.API_BASE + '/health', { signal: AbortSignal.timeout(3000) });
                VC.State.backendAvailable = resp.ok;
            } catch { VC.State.backendAvailable = false; }
        },

        /**
         * 开始 VAD 监听 (点击一次，说完自动停止)
         */
        async startRecording() {
            if (isListening) return;
            isListening = true;
            pcmChunks = [];

            try {
                console.log('[Voice] 请求麦克风...');
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
                });

                audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
                await audioCtx.audioWorklet.addModule('/vad-processor.js');

                const source = audioCtx.createMediaStreamSource(mediaStream);
                workletNode = new AudioWorkletNode(audioCtx, 'vad-processor');

                workletNode.port.onmessage = (event) => {
                    this._handleVAD(event.data);
                };

                source.connect(workletNode);
                // 不连接 destination，只采集不播放

                VC.State.setVoiceState('recording');
                console.log('[Voice] VAD 监听中，等待说话...');
            } catch (e) {
                console.error('[Voice] 启动失败:', e.name, e.message);
                this._cleanup();
                VC.State.setVoiceState('idle');
            }
        },

        /**
         * 停止录音
         */
        stopRecording() {
            if (!isListening) return;
            console.log('[Voice] 手动停止');
            this._stopAndProcess();
        },

        toggle() {
            if (VC.State.voiceState === 'recording') {
                this.stopRecording();
            } else if (VC.State.voiceState === 'idle') {
                this.startRecording();
            }
        },

        stop() {
            this.stopRecording();
        },

        /**
         * VAD 事件处理
         */
        _handleVAD(msg) {
            switch (msg.type) {
                case 'speech_start':
                    console.log('[Voice] VAD: 检测到人声，开始收集音频');
                    break;

                case 'audio':
                    // 收集 Float32 音频帧
                    pcmChunks.push(new Float32Array(msg.data));
                    break;

                case 'speech_end':
                    console.log(`[Voice] VAD: 说话结束，共 ${pcmChunks.length} 帧`);
                    this._stopAndProcess();
                    break;
            }
        },

        /**
         * 停止采集并发送 ASR
         */
        async _stopAndProcess() {
            if (!isListening) return;
            isListening = false;

            this._cleanup();
            VC.State.setVoiceState('processing');

            // 合并 Float32 帧
            const totalSamples = pcmChunks.reduce((sum, c) => sum + c.length, 0);
            if (totalSamples < SAMPLE_RATE * 0.3) {
                console.warn('[Voice] 音频太短 (<0.3s)，跳过');
                VC.State.setVoiceState('idle');
                return;
            }

            const float32 = new Float32Array(totalSamples);
            let offset = 0;
            for (const chunk of pcmChunks) {
                float32.set(chunk, offset);
                offset += chunk.length;
            }
            pcmChunks = [];

            // Float32 → Int16
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            console.log(`[Voice] PCM: ${int16.length} samples, ${int16.length * 2} bytes`);

            // 发送到 ASR
            try {
                const base64 = this._arrayBufferToBase64(int16.buffer);
                console.log(`[Voice] 发送到 ASR (${base64.length} chars base64)`);

                const resp = await fetch(VC.Config.API_BASE + '/voice/asr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audio_data: base64,
                        mime_type: 'audio/pcm',
                        language: 'auto'
                    })
                });

                if (resp.ok) {
                    const data = await resp.json();
                    if (data.text) {
                        console.log(`[Voice] ASR 结果: '${data.text}'`);
                        VC.State.emit('recognized', { text: data.text, isFinal: true });
                    } else {
                        console.warn('[Voice] ASR 返回空');
                    }
                } else {
                    console.error(`[Voice] ASR HTTP ${resp.status}`);
                }
            } catch (e) {
                console.error('[Voice] ASR 失败:', e);
            }

            VC.State.setVoiceState('idle');
        },

        /**
         * ArrayBuffer → Base64
         */
        _arrayBufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        },

        /**
         * 清理音频资源
         */
        _cleanup() {
            if (workletNode) { workletNode.disconnect(); workletNode = null; }
            if (audioCtx) { audioCtx.close(); audioCtx = null; }
            if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
        },

        /**
         * TTS 播报 — 始终优先使用 MiMo TTS，不等待播放完成（fire-and-forget）
         */
        async speak(text) {
            console.log(`[Voice] TTS: '${text}'`);
            try {
                const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, voice: 'Chloe' }),
                    signal: AbortSignal.timeout(8000)
                });
                if (resp.ok) {
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const audio = new Audio(url);
                    audio.onended = () => URL.revokeObjectURL(url);
                    audio.onerror = () => URL.revokeObjectURL(url);
                    audio.play().catch(() => {});
                    return; // 不等待播放完成，立即返回
                }
            } catch (e) {
                console.warn('[Voice] MiMo TTS 失败，降级浏览器TTS:', e);
            }
            this._speakFallback(text);
        },

        _speakFallback(text) {
            if (!window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'zh-CN';
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
        }
    };

    console.log('[Voice] 语音模块加载完成 (VAD 模式)');
})();
