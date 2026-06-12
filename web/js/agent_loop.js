/**
 * VC.AgentLoop - 永久循环 Agent 控制器
 *
 * 连接后端 Agent WebSocket，管理：
 * - 语音输入 → 发送到 Agent
 * - Agent 播报 → TTS 播放
 * - Agent 动作 → 画布执行
 * - 画布状态 → 同步到 Agent
 * - 全双工：说话时打断播报
 * - 语义分块：智能判定句子边界
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

    // ASR WebSocket（增量识别）
    let asrWs = null;
    let asrRetryCount = 0;
    const ASR_MAX_RETRIES = 5;

    // ==================== 语义分块器 ====================
    class SemanticChunker {
        constructor(onChunk) {
            this.onChunk = onChunk;      // 分块完成回调
            this.buffer = '';             // 待处理文本
            this.lastWordTime = 0;        // 上一个词的时间戳
            this.wordTimes = [];          // 词间隔历史
            this.debounceTimer = null;

            // 动态参数
            this.baseDebounce = 2500;     // 基础防抖 2.5s
            this.minDebounce = 1500;      // 最小防抖 1.5s（语速快时）
            this.maxDebounce = 4000;      // 最大防抖 4s（短词连续时）
            this.baseWordThreshold = 20;  // 基础词数阈值
            this.minWordThreshold = 15;   // 最小词数（语速快时）

            // 连接词（中英文）
            this.connectors = [
                '因为', '所以', '但是', '然而', '而且', '或者', '如果', '虽然',
                '即使', '除非', '无论', '不仅', '而且', '不过', '于是',
                'because', 'however', 'which', 'that', 'but', 'and', 'or',
                'if', 'while', 'although', 'unless', 'when', 'where',
            ];

            // 数字/日期模式
            this.numberPattern = /\d+[年月日时分秒]?[\.\d]*/;
        }

        /**
         * 增量文本输入
         * @param {string} text - ASR 增量结果
         * @param {number} timestamp - 时间戳
         */
        feed(text, timestamp) {
            if (!text || text === this.buffer) return;

            const prevWords = this.buffer.split(/\s+/).filter(Boolean);
            const newWords = text.split(/\s+/).filter(Boolean);
            const addedWords = newWords.slice(prevWords.length);

            this.buffer = text;

            // 计算词间隔
            const now = timestamp || Date.now();
            if (addedWords.length > 0 && this.lastWordTime > 0) {
                const interval = now - this.lastWordTime;
                this.wordTimes.push(interval);
                if (this.wordTimes.length > 10) this.wordTimes.shift();
            }
            this.lastWordTime = now;

            // 重置防抖
            if (this.debounceTimer) clearTimeout(this.debounceTimer);

            // 检查是否应该立即分块
            if (this._shouldSplitImmediate(text)) {
                this._flush();
                return;
            }

            // 动态计算防抖时间
            const debounce = this._calcDebounce();
            const wordThreshold = this._calcWordThreshold();

            // 词数触发
            if (newWords.length >= wordThreshold) {
                this._flush();
                return;
            }

            // 连接词保护：遇到连接词延长等待
            if (this._endsWithConnector(text)) {
                this.debounceTimer = setTimeout(() => this._flush(), this.maxDebounce);
                return;
            }

            // 数字保护：未完成的数字延长等待
            if (this._endsWithIncompleteNumber(text)) {
                this.debounceTimer = setTimeout(() => this._flush(), this.maxDebounce);
                return;
            }

            // 短词连续：延长等待
            if (this._isShortWordSequence(text)) {
                this.debounceTimer = setTimeout(() => this._flush(), this.maxDebounce);
                return;
            }

            // 标准防抖
            this.debounceTimer = setTimeout(() => this._flush(), debounce);
        }

        /**
         * 强制分块（用户停止说话）
         */
        forceFlush() {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this._flush();
        }

        /**
         * 清空缓冲区
         */
        clear() {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.buffer = '';
            this.wordTimes = [];
            this.lastWordTime = 0;
        }

        // ========== 分块判断策略 ==========

        _shouldSplitImmediate(text) {
            // 句尾标点 + 下一个词是大写/中文开头 → 立即分块
            const match = text.match(/[。！？.!？]\s*\S/);
            if (match) return true;

            // 中文句号后跟内容
            if (/[。！？]\s*[一-鿿]/.test(text)) return true;

            return false;
        }

        _endsWithConnector(text) {
            const trimmed = text.trim();
            const lastWord = trimmed.split(/\s+/).pop() || '';
            return this.connectors.some(c =>
                trimmed.endsWith(c) || lastWord.toLowerCase() === c
            );
        }

        _endsWithIncompleteNumber(text) {
            const trimmed = text.trim();
            // 以数字结尾但后面可能还有单位
            if (/\d$/.test(trimmed)) return true;
            // "2026 年" 这种模式，等完整
            if (/\d+\s*$/.test(trimmed)) return true;
            return false;
        }

        _isShortWordSequence(text) {
            const words = text.split(/\s+/).filter(Boolean);
            if (words.length < 3) return true;
            // 最近3个词都是短词（≤2字符）
            const recent = words.slice(-3);
            return recent.every(w => w.length <= 2);
        }

        _calcDebounce() {
            if (this.wordTimes.length < 3) return this.baseDebounce;

            const avgInterval = this.wordTimes.reduce((a, b) => a + b, 0) / this.wordTimes.length;

            if (avgInterval < 200) {
                // 语速快 → 缩短防抖
                return this.minDebounce;
            } else if (avgInterval > 800) {
                // 语速慢 → 提前触发
                return this.minDebounce;
            }
            return this.baseDebounce;
        }

        _calcWordThreshold() {
            if (this.wordTimes.length < 3) return this.baseWordThreshold;

            const avgInterval = this.wordTimes.reduce((a, b) => a + b, 0) / this.wordTimes.length;

            // 语速快 → 降低词数阈值
            if (avgInterval < 200) return this.minWordThreshold;
            return this.baseWordThreshold;
        }

        _flush() {
            const text = this.buffer.trim();
            if (text) {
                this.onChunk(text);
            }
            this.buffer = '';
            this.wordTimes = [];
            this.lastWordTime = 0;
        }
    }

    // 语义分块器实例
    let chunker = null;

    VC.AgentLoop = {
        /**
         * 初始化并启动 Agent 循环
         */
        async start() {
            try {
                // 初始化语义分块器
                chunker = new SemanticChunker((chunkText) => {
                    // 分块完成 → 发送到 Agent
                    console.log('[AgentLoop] 分块:', chunkText);
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'text', text: chunkText }));
                        addChatMessage('user', chunkText);
                    }
                });

                // 连接 Agent WebSocket
                await this._connect();

                // 启动语音捕获
                await this._startAudioCapture();

                // 监听 ASR 增量结果 → 喂给分块器
                VC.State.on('recognized', ({ text, isFinal }) => {
                    if (!text) return;
                    if (isFinal) {
                        // 最终结果 → 强制分块
                        chunker.forceFlush();
                    } else {
                        // 增量结果 → 喂给分块器
                        chunker.feed(text, Date.now());
                    }
                });

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
            if (chunker) { chunker.clear(); chunker = null; }
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
         * 启动音频捕获（VAD + ASR WebSocket 增量识别）
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

                // 连接 ASR WebSocket（增量识别）
                await this._connectASR();

                workletNode.port.onmessage = (event) => {
                    const { type, data } = event.data;

                    if (type === 'audio') {
                        // Barge-in
                        this._onSpeechDetected();
                        isListening = true;

                        // 发送 PCM 音频到 ASR WebSocket
                        if (asrWs?.readyState === WebSocket.OPEN) {
                            asrWs.send(data);
                        }
                    }

                    if (type === 'silence' && isListening) {
                        isListening = false;
                        // 通知 ASR 说话结束
                        if (asrWs?.readyState === WebSocket.OPEN) {
                            asrWs.send(JSON.stringify({ action: 'stop' }));
                        }
                    }
                };

                source.connect(workletNode);
                workletNode.connect(audioCtx.destination);

                console.log('[AgentLoop] 音频捕获已启动 (VAD + ASR)');
            } catch (e) {
                console.error('[AgentLoop] 音频捕获失败:', e);
                throw e;
            }
        },

        /**
         * 连接 ASR WebSocket（增量识别）
         */
        async _connectASR() {
            return new Promise((resolve, reject) => {
                const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
                const url = `${protocol}//${location.host}/ai/v1/voice/asr/ws`;

                asrWs = new WebSocket(url);

                asrWs.onopen = () => {
                    console.log('[AgentLoop] ASR WebSocket 已连接');
                    asrRetryCount = 0;

                    // 发送 ASR start 指令
                    asrWs.send(JSON.stringify({
                        action: 'start',
                        task_id: `asr-${Date.now()}`,
                        config: { parameters: { format: 'pcm', sample_rate: 16000 } }
                    }));
                    resolve();
                };

                asrWs.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        if (msg.type === 'result') {
                            // ASR 增量/最终结果 → 喂给分块器
                            if (chunker) {
                                if (msg.is_final) {
                                    // 最终结果：用文本更新 buffer，然后强制分块
                                    chunker.buffer = msg.text;
                                    chunker.forceFlush();
                                } else {
                                    // 增量结果：喂给分块器
                                    chunker.feed(msg.text, Date.now());
                                }
                            }
                        }
                    } catch { /* 忽略 */ }
                };

                asrWs.onerror = (e) => {
                    console.error('[AgentLoop] ASR WebSocket 错误:', e);
                    reject(new Error('ASR 连接失败'));
                };

                asrWs.onclose = (e) => {
                    console.log(`[AgentLoop] ASR WebSocket 关闭 (code=${e.code})`);
                    // 自动重连
                    if (e.code !== 1000 && asrRetryCount < ASR_MAX_RETRIES && window.agentRunning) {
                        const delay = 1000 * Math.pow(2, asrRetryCount);
                        setTimeout(async () => {
                            asrRetryCount++;
                            try { await this._connectASR(); } catch { /* 重试失败 */ }
                        }, delay);
                    }
                };
            });
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
            if (asrWs) { asrWs.close(); asrWs = null; }
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
        },

        /**
         * 设置鼠标目标（用于指代词解析："它"、"刚才那个"）
         */
        _setMouseTarget(id) {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'mouse_target', target: id }));
            }
        },

        /**
         * 增量 ASR 结果处理（预判执行）
         * 返回 true 表示已预判执行，跳过后续处理
         */
        _onPartialASR(text) {
            const trimmed = text.trim();

            // 高置信度快指令 → 不等 final 直接执行
            const fastCmds = {
                '撤销': 'undo', '撤回': 'undo', '取消': 'undo',
                '清空': 'clear', '清除': 'clear',
                '停止': 'stop', '安静': 'stop',
            };

            if (fastCmds[trimmed]) {
                console.log('[AgentLoop] 预判执行:', trimmed);
                VC.Cmd.processText(trimmed);
                return true;
            }

            return false;
        }
    };

    console.log('[AgentLoop] Agent 循环模块加载完成');
})();
