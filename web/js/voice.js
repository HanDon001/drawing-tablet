/**
 * VC.Voice - 简化语音服务
 * 模式: 一次性录音 → ASR → 返回文本
 * 降级: Web Speech API
 */
(function() {
    'use strict';

    let mediaRecorder = null;
    let audioChunks = [];
    let mediaStream = null;

    VC.Voice = {
        /**
         * 初始化
         */
        async init() {
            await this._checkBackend();
            console.log('[Voice] 语音服务初始化完成, 后端:', VC.State.backendAvailable ? '可用' : '不可用');
        },

        async _checkBackend() {
            try {
                const resp = await fetch(VC.Config.API_BASE + '/health', { signal: AbortSignal.timeout(3000) });
                VC.State.backendAvailable = resp.ok;
            } catch { VC.State.backendAvailable = false; }
        },

        /**
         * 开始录音（一次性）
         */
        async startRecording() {
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioChunks = [];

                // 优先 webm，降级任何可用格式
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : MediaRecorder.isTypeSupported('audio/webm')
                        ? 'audio/webm'
                        : '';

                mediaRecorder = mimeType
                    ? new MediaRecorder(mediaStream, { mimeType })
                    : new MediaRecorder(mediaStream);

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) audioChunks.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    VC.State.setVoiceState('processing');
                    try {
                        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                        audioChunks = [];

                        if (blob.size < 100) {
                            VC.State.setVoiceState('idle');
                            return;
                        }

                        const text = await this._transcribe(blob);
                        if (text) {
                            VC.State.emit('recognized', { text, isFinal: true });
                        }
                    } catch (e) {
                        console.error('[Voice] 识别失败:', e);
                    } finally {
                        VC.State.setVoiceState('idle');
                    }
                };

                mediaRecorder.start();
                VC.State.setVoiceState('recording');
                console.log('[Voice] 开始录音');
            } catch (e) {
                console.error('[Voice] 录音失败:', e);
                VC.State.setVoiceState('idle');
            }
        },

        /**
         * 停止录音
         */
        stopRecording() {
            if (mediaRecorder?.state === 'recording') {
                mediaRecorder.stop();
                console.log('[Voice] 停止录音');
            }
            mediaStream?.getTracks().forEach(t => t.stop());
        },

        /**
         * 切换录音状态
         */
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
         * 音频 → ASR 文本
         */
        async _transcribe(blob) {
            // 后端可用 → MiMo ASR
            if (VC.State.backendAvailable) {
                try {
                    const base64 = await this._blobToBase64(blob);
                    const resp = await fetch(VC.Config.API_BASE + '/voice/asr', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ audio_data: base64, mime_type: blob.type, language: 'auto' })
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.text) {
                            console.log('[Voice] ASR 结果:', data.text);
                            return data.text;
                        }
                    }
                } catch (e) {
                    console.warn('[Voice] 后端 ASR 失败，降级:', e);
                }
            }

            // 降级: Web Speech API
            return this._webSpeechRecognize();
        },

        _blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },

        _webSpeechRecognize() {
            return new Promise((resolve) => {
                if (!('webkitSpeechRecognition' in window)) { resolve(''); return; }
                const r = new webkitSpeechRecognition();
                r.lang = 'zh-CN';
                r.continuous = false;
                r.interimResults = false;
                r.onresult = (e) => resolve(e.results[0][0].transcript);
                r.onerror = () => resolve('');
                r.onend = () => resolve('');
                r.start();
            });
        },

        /**
         * TTS 播报
         */
        async speak(text) {
            try {
                if (VC.State.backendAvailable) {
                    const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, voice: 'Chloe' })
                    });
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const url = URL.createObjectURL(blob);
                        const audio = new Audio(url);
                        await new Promise((resolve) => {
                            audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
                            audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                            audio.play().catch(() => resolve());
                        });
                        return;
                    }
                }
            } catch (e) {
                console.warn('[Voice] TTS 失败，降级:', e);
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

    console.log('[Voice] 语音模块加载完成');
})();
