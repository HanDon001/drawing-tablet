/**
 * VC.Voice - 双通道语音服务
 * 后端 MiMo API 优先，Web Speech API 降级
 * 状态机: idle → recording → processing → speaking → idle
 */
(function() {
    'use strict';

    let mediaRecorder = null;
    let audioChunks = [];
    let mediaStream = null;
    let recognition = null;

    VC.Voice = {
        /**
         * 初始化语音服务
         */
        async init() {
            await this._checkBackend();
            this._initWebSpeech();
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
         * 初始化 Web Speech API
         */
        _initWebSpeech() {
            if (!('webkitSpeechRecognition' in window)) return;

            recognition = new webkitSpeechRecognition();
            recognition.lang = VC.Config.ASR_LANGUAGE;
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onresult = (e) => {
                const text = e.results[0][0].transcript;
                console.log('[Voice] Web Speech 识别:', text);
                this._onRecognized(text);
            };

            recognition.onerror = (e) => {
                console.error('[Voice] Web Speech 错误:', e.error);
                VC.State.setVoiceState('idle');
            };

            recognition.onend = () => {
                if (VC.State.voiceState === 'recording') {
                    VC.State.setVoiceState('idle');
                }
            };
        },

        /**
         * 开始录音
         */
        async startRecording() {
            if (VC.State.voiceState !== 'idle') {
                console.warn('[Voice] 当前状态不允许录音:', VC.State.voiceState);
                return false;
            }

            VC.State.setVoiceState('recording');

            // 优先使用 MediaRecorder + 后端 ASR
            if (VC.State.backendAvailable) {
                try {
                    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(mediaStream, {
                        mimeType: 'audio/webm;codecs=opus'
                    });
                    audioChunks = [];

                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0) audioChunks.push(e.data);
                    };

                    mediaRecorder.onstop = () => {
                        this._processAudio();
                    };

                    mediaRecorder.start();
                    console.log('[Voice] MediaRecorder 开始录音');
                    return true;
                } catch (e) {
                    console.warn('[Voice] MediaRecorder 失败，降级到 Web Speech');
                }
            }

            // 降级到 Web Speech API
            if (recognition) {
                try {
                    recognition.start();
                    console.log('[Voice] Web Speech 开始识别');
                    return true;
                } catch (e) {
                    console.error('[Voice] Web Speech 启动失败:', e);
                }
            }

            VC.State.setVoiceState('idle');
            return false;
        },

        /**
         * 停止录音
         */
        stopRecording() {
            if (VC.State.voiceState !== 'recording') return;

            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                if (mediaStream) {
                    mediaStream.getTracks().forEach(t => t.stop());
                }
            }

            if (recognition) {
                try { recognition.stop(); } catch (e) {}
            }
        },

        /**
         * 处理录音数据
         */
        async _processAudio() {
            VC.State.setVoiceState('processing');

            try {
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                const base64 = await this._blobToBase64(blob);

                const result = await fetch(VC.Config.API_BASE + '/voice/asr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audio_data: base64,
                        mime_type: 'audio/webm',
                        language: 'auto'
                    })
                });

                if (!result.ok) throw new Error('ASR 请求失败');

                const data = await result.json();
                console.log('[Voice] MiMo ASR 识别:', data.text);
                this._onRecognized(data.text);
            } catch (e) {
                console.error('[Voice] ASR 失败:', e);
                VC.State.setVoiceState('idle');
                if (VC.Log) VC.Log.add('system', '语音识别失败，请重试');
            }
        },

        /**
         * 识别结果回调
         */
        _onRecognized(text) {
            VC.State.setVoiceState('idle');
            VC.State.emit('recognized', { text });
        },

        /**
         * 语音播报
         */
        async speak(text) {
            if (VC.State.voiceState !== 'idle') {
                console.warn('[Voice] 当前状态不允许播报:', VC.State.voiceState);
                return;
            }

            VC.State.setVoiceState('speaking');
            console.log('[Voice] 播报:', text);

            // 优先使用 MiMo TTS
            if (VC.State.backendAvailable) {
                try {
                    const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text,
                            voice: VC.Config.TTS_VOICE
                        })
                    });

                    if (!resp.ok) throw new Error('TTS 请求失败');

                    const blob = await resp.blob();
                    await this._playAudioBlob(blob);
                    VC.State.setVoiceState('idle');
                    return;
                } catch (e) {
                    console.warn('[Voice] MiMo TTS 失败，降级到 Web Speech');
                }
            }

            // 降级到 Web Speech API
            this._webSpeechSpeak(text);
        },

        /**
         * Web Speech TTS
         */
        _webSpeechSpeak(text) {
            if (!('speechSynthesis' in window)) {
                VC.State.setVoiceState('idle');
                return;
            }

            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = VC.Config.ASR_LANGUAGE;
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            utterance.onend = () => VC.State.setVoiceState('idle');
            utterance.onerror = () => VC.State.setVoiceState('idle');

            window.speechSynthesis.speak(utterance);
        },

        /**
         * 播放音频 Blob
         */
        _playAudioBlob(blob) {
            return new Promise((resolve, reject) => {
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);

                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };

                audio.onerror = (e) => {
                    URL.revokeObjectURL(url);
                    reject(e);
                };

                audio.play().catch(reject);
            });
        },

        /**
         * Blob 转 Base64
         */
        _blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },

        /**
         * 停止当前播报
         */
        stopSpeaking() {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            if (VC.State.voiceState === 'speaking') {
                VC.State.setVoiceState('idle');
            }
        }
    };

    console.log('[Voice] 语音模块加载完成');
})();
