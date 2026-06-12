/**
 * VC.AgentLoop - 永久循环 Agent 控制器
 *
 * 连接后端 Agent WebSocket，管理：
 * - 语音输入 → 发送到 Agent
 * - Agent 播报 → TTS 播放
 * - Agent 动作 → 画布执行
 * - 画布状态 → 同步到 Agent
 * - 全双工：说话时打断播报
 */

(function() {
    'use strict';

    let ws = null;
    let audioCtx = null;
    let workletNode = null;
    let mediaStream = null;
    let currentAudio = null;
    let isSpeaking = false;
    let isListening = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const BACKOFF_MS = 1000;

    // 播报队列（防重叠）
    const speakQueue = [];
    let speakingInProgress = false;

    VC.AgentLoop = {
        /**
         * 初始化并启动 Agent 循环
         */
        async start() {
            try {
                // 连接 Agent WebSocket
                await this._connect();

                // 启动语音捕获
                await this._startAudioCapture();

                VC.State.setVoiceState('recording');
                VC.Log.add('system', '🤖 Agent 循环已启动');

            } catch (e) {
                console.error('[AgentLoop] 启动失败:', e);
                VC.Log.add('system', '⚠️ Agent 启动失败: ' + e.message);
            }
        },

        /**
         * 停止 Agent 循环
         */
        stop() {
            this._stopAudioCapture();
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'stop' }));
            }
            ws?.close();
            ws = null;
            VC.State.setVoiceState('idle');
            VC.Log.add('system', '🤖 Agent 已停止');
        },

        /**
         * 连接 Agent WebSocket
         */
        _connect() {
            return new Promise((resolve, reject) => {
                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const url = `${protocol}//${location.host}/ai/v1/agent`;

                ws = new WebSocket(url);

                ws.onopen = () => {
                    console.log('[AgentLoop] WebSocket 已连接');
                    retryCount = 0;
                    resolve();
                };

                ws.onerror = (e) => {
                    console.error('[AgentLoop] WebSocket 错误:', e);
                    reject(new Error('连接失败'));
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        this._handleMessage(msg);
                    } catch { /* 忽略 */ }
                };

                ws.onclose = (e) => {
                    console.log(`[AgentLoop] WebSocket 关闭 (code=${e.code})`);
                    if (e.code !== 1000 && retryCount < MAX_RETRIES) {
                        const delay = BACKOFF_MS * Math.pow(2, retryCount);
                        console.warn(`[AgentLoop] ${delay}ms 后重连`);
                        setTimeout(async () => {
                            retryCount++;
                            try {
                                await this._connect();
                                // 重连后重启音频捕获
                                if (!workletNode) await this._startAudioCapture();
                            } catch {
                                VC.Log.add('system', '⚠️ Agent 重连失败');
                            }
                        }, delay);
                    }
                };
            });
        },

        /**
         * 处理 Agent 消息
         */
        async _handleMessage(msg) {
            switch (msg.type) {
                case 'speak':
                    // Agent 要播报
                    await this._speak(msg.text);
                    break;

                case 'action':
                    // Agent 要执行动作
                    await this._executeAction(msg.action);
                    break;

                case 'state':
                    // Agent 状态变更
                    VC.Log.add('agent', `状态: ${msg.state}`);
                    break;
            }
        },

        /**
         * 播报（温柔 TTS，带队列防重叠）
         */
        async _speak(text) {
            // 入队列
            speakQueue.push(text);
            if (!speakingInProgress) {
                await this._drainSpeakQueue();
            }
        },

        async _drainSpeakQueue() {
            speakingInProgress = true;
            while (speakQueue.length > 0) {
                const text = speakQueue.shift();
                isSpeaking = true;

                VC.State.emit('agentSpeak', { text });
                VC.Log.add('agent', `🔊 ${text}`);
                addChatMessage('assistant', text);

                try {
                    if (VC.State.backendAvailable) {
                        const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                text,
                                voice: 'Chloe',
                                style: 'Gentle, warm, caring, slow pace, like talking to a close friend'
                            })
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

                            isSpeaking = false;
                            continue;
                        }
                    }
                } catch (e) {
                    console.warn('[AgentLoop] TTS 失败，降级:', e);
                }

                // 降级：浏览器 TTS
                await this._speakFallback(text);
                isSpeaking = false;
            }
            speakingInProgress = false;
        },

        _speakFallback(text) {
            return new Promise((resolve) => {
                if (!window.speechSynthesis) { resolve(); return; }
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'zh-CN';
                u.rate = 0.9; // 稍慢语速
                u.onend = () => resolve();
                u.onerror = resolve;
                window.speechSynthesis.speak(u);
            });
        },

        /**
         * Barge-in：用户说话时打断播报
         */
        _onSpeechDetected() {
            if (isSpeaking) {
                console.log('[AgentLoop] Barge-in: 打断播报');
                currentAudio?.pause();
                currentAudio = null;
                isSpeaking = false;
                window.speechSynthesis?.cancel();
            }
        },

        /**
         * 执行 Agent 下发的动作
         */
        async _executeAction(action) {
            const { tool, params } = action;

            switch (tool) {
                case 'draw_shape': {
                    const pos = VC.Canvas.parsePosition(params.position || 'center');
                    const size = VC.Canvas.parseSize(params.size || 'medium');
                    VC.Cmd.drawShape({
                        shape: params.shape_type || 'circle',
                        color: params.color || 'black',
                        x: pos.x,
                        y: pos.y,
                        width: size.w,
                        height: size.h,
                        tag: params.tag
                    });
                    break;
                }
                case 'edit_shape': {
                    // 根据 tag 找到对象并修改
                    const obj = VC.State.objects.find(o =>
                        o.tag === params.target_tag || o.id === params.target_tag
                    );
                    if (obj) {
                        if (params.new_color) obj.color = params.new_color;
                        if (params.new_size) {
                            const s = VC.Canvas.parseSize(params.new_size);
                            obj.width = s.w;
                            obj.height = s.h;
                        }
                        VC.State.emit('objectsChange');
                    }
                    break;
                }
                case 'delete_shape': {
                    const idx = VC.State.objects.findIndex(o =>
                        o.tag === params.target_tag || o.id === params.target_tag
                    );
                    if (idx !== -1) {
                        VC.State.objects.splice(idx, 1);
                        VC.State.emit('objectsChange');
                    }
                    break;
                }
            }

            VC.Canvas.render();
            this._syncCanvas();
        },

        /**
         * 启动音频捕获（VAD）
         */
        async _startAudioCapture() {
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
                });

                audioCtx = new AudioContext({ sampleRate: 16000 });
                await audioCtx.audioWorklet.addModule('/vad-processor.js');

                const source = audioCtx.createMediaStreamSource(mediaStream);
                workletNode = new AudioWorkletNode(audioCtx, 'vad-processor');

                workletNode.port.onmessage = (event) => {
                    const { type, data } = event.data;

                    if (type === 'audio') {
                        // 检测到语音 → Barge-in
                        this._onSpeechDetected();

                        // 发送音频到 Agent
                        if (ws?.readyState === WebSocket.OPEN) {
                            ws.send(data); // 发送 PCM 二进制
                        }
                        isListening = true;
                    }

                    if (type === 'silence' && isListening) {
                        isListening = false;
                        // 通知 Agent 说话结束
                        if (ws?.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'silence_end' }));
                        }
                    }
                };

                source.connect(workletNode);
                workletNode.connect(audioCtx.destination);

                console.log('[AgentLoop] 音频捕获已启动 (VAD)');
            } catch (e) {
                console.error('[AgentLoop] 音频捕获失败:', e);
                throw e;
            }
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
         * 同步画布状态到 Agent
         */
        _syncCanvas() {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'canvas',
                    objects: VC.State.objects || []
                }));
            }
        },

        /**
         * 手动发送文字消息到 Agent
         */
        sendText(text) {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'text', text }));
                addChatMessage('user', text);
            }
        }
    };

    console.log('[AgentLoop] Agent 循环模块加载完成');
})();
