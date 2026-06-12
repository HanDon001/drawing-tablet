/**
 * VC.Gateway - 全链路 WebSocket 网关客户端
 *
 * 单管道: AudioWorklet → PCM → WebSocket → ASR → LLM → 结果
 * 零 HTTP 往返，最低延迟
 */

(function() {
    'use strict';

    let ws = null;
    let audioCtx = null;
    let workletNode = null;
    let mediaStream = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const BACKOFF_MS = 1000;

    // 回调
    let onPartial = null;
    let onFinal = null;
    let onActions = null;
    let onReply = null;
    let onStatus = null;

    VC.Gateway = {
        /**
         * 启动全链路
         * @param {Object} callbacks - { onPartial, onFinal, onActions, onReply, onStatus }
         */
        async start(callbacks = {}) {
            onPartial = callbacks.onPartial || (() => {});
            onFinal = callbacks.onFinal || (() => {});
            onActions = callbacks.onActions || (() => {});
            onReply = callbacks.onReply || (() => {});
            onStatus = callbacks.onStatus || (() => {});

            try {
                await this._connect();
                await this._startAudio();
                onStatus('listening');
                console.log('[Gateway] 全链路已启动');
            } catch (e) {
                console.error('[Gateway] 启动失败:', e);
                throw e;
            }
        },

        /**
         * 停止
         */
        stop() {
            this._stopAudio();
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'stop' }));
            }
            ws?.close();
            ws = null;
            retryCount = 0;
            onStatus('idle');
            console.log('[Gateway] 已停止');
        },

        /**
         * 发送文字指令
         */
        sendText(text) {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'text', text }));
            }
        },

        /**
         * 连接 WebSocket 网关
         */
        _connect() {
            return new Promise((resolve, reject) => {
                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const url = `${protocol}//${location.host}/ai/v1/gateway`;

                ws = new WebSocket(url);
                ws.binaryType = 'arraybuffer';

                ws.onopen = () => {
                    console.log('[Gateway] WebSocket 已连接');
                    retryCount = 0;
                    resolve();
                };

                ws.onerror = (e) => {
                    console.error('[Gateway] 错误:', e);
                    reject(new Error('连接失败'));
                };

                ws.onmessage = (event) => {
                    // 二进制: TTS 音频
                    if (event.data instanceof ArrayBuffer) {
                        this._playTTSAudio(event.data);
                        return;
                    }

                    // 文本: JSON 消息
                    try {
                        const msg = JSON.parse(event.data);
                        this._handleMessage(msg);
                    } catch { /* 忽略 */ }
                };

                ws.onclose = (e) => {
                    console.log(`[Gateway] 关闭 (code=${e.code})`);
                    if (e.code !== 1000 && retryCount < MAX_RETRIES) {
                        const delay = BACKOFF_MS * Math.pow(2, retryCount);
                        setTimeout(async () => {
                            retryCount++;
                            try {
                                await this._connect();
                                if (!workletNode) await this._startAudio();
                            } catch { /* 重试失败 */ }
                        }, delay);
                    }
                };
            });
        },

        /**
         * 处理服务端消息
         */
        _handleMessage(msg) {
            switch (msg.type) {
                case 'partial':
                    onPartial(msg.text);
                    break;
                case 'final':
                    onFinal(msg.text);
                    break;
                case 'actions':
                    onActions(msg.actions || []);
                    break;
                case 'reply':
                    onReply(msg.text);
                    break;
                case 'status':
                    onStatus(msg.state);
                    break;
                case 'error':
                    console.error('[Gateway] 错误:', msg.message);
                    break;
            }
        },

        /**
         * 启动音频捕获 (AudioWorklet → PCM → WebSocket)
         */
        async _startAudio() {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });

            audioCtx = new AudioContext({ sampleRate: 16000 });
            await audioCtx.audioWorklet.addModule('/pcm-processor.js');

            const source = audioCtx.createMediaStreamSource(mediaStream);
            workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');

            workletNode.port.onmessage = (event) => {
                // PCM Int16 ArrayBuffer → 直发 WebSocket
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(event.data);
                }
            };

            source.connect(workletNode);
            workletNode.connect(audioCtx.destination);
            console.log('[Gateway] 音频捕获已启动 (16kHz PCM)');
        },

        /**
         * 停止音频
         */
        _stopAudio() {
            workletNode?.disconnect();
            workletNode = null;
            audioCtx?.close();
            audioCtx = null;
            mediaStream?.getTracks().forEach(t => t.stop());
            mediaStream = null;
        },

        /**
         * 播放 TTS 音频
         */
        async _playTTSAudio(arrayBuffer) {
            try {
                const blob = new Blob([arrayBuffer], { type: 'audio/pcm' });
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.onended = () => URL.revokeObjectURL(url);
                audio.onerror = () => URL.revokeObjectURL(url);
                await audio.play();
            } catch (e) {
                console.warn('[Gateway] TTS 播放失败:', e);
            }
        }
    };

    console.log('[Gateway] 网关模块加载完成');
})();
