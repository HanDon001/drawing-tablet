/**
 * VC.AIDraw - AI 绘图模式控制器
 * 语音/文字描述 → 调用后端图像生成 → 绘制到画布
 */
(function() {
    'use strict';

    let isGenerating = false;
    let currentPrompt = '';

    VC.AIDraw = {
        /**
         * AI 绘图模式是否激活
         */
        isActive() {
            return VC.State.drawingMode === true;
        },

        /**
         * 切换 AI 绘图模式
         */
        toggle() {
            VC.State.drawingMode = !VC.State.drawingMode;

            if (VC.State.drawingMode) {
                VC.State.currentTool = 'ai_draw';
                this._showPromptBar();
                if (VC.Log) VC.Log.add('ai', '🎨 AI 绘图模式已开启');
            } else {
                VC.State.currentTool = 'select';
                this._hidePromptBar();
                if (VC.Log) VC.Log.add('ai', 'AI 绘图模式已关闭');
            }

            VC.State.emit('modeChange');
            return VC.State.drawingMode;
        },

        /**
         * 开启 AI 绘图模式
         */
        activate() {
            if (!VC.State.drawingMode) {
                this.toggle();
            }
        },

        /**
         * 关闭 AI 绘图模式
         */
        deactivate() {
            if (VC.State.drawingMode) {
                this.toggle();
            }
        },

        /**
         * 生成图片（核心方法）
         * @param {string} prompt - 用户描述
         * @param {string} style - 风格（可选）
         */
        async generate(prompt, style) {
            if (isGenerating) {
                if (VC.Log) VC.Log.add('ai', '⚠️ 正在生成中，请稍候');
                return false;
            }

            if (!prompt || !prompt.trim()) {
                if (VC.Log) VC.Log.add('ai', '⚠️ 请输入描述');
                return false;
            }

            isGenerating = true;
            currentPrompt = prompt.trim();

            this._showGenerating();
            if (VC.Log) VC.Log.add('ai', `🎨 正在生成: "${currentPrompt}"`);

            try {
                // 调用后端图像生成 API
                const resp = await fetch(VC.Config.API_BASE + '/image/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: currentPrompt,
                        style: style || 'realistic',
                        size: '1024*1024'
                    })
                });

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                const data = await resp.json();

                if (data.status === 'success' && data.image_url) {
                    // 下载图片并绘制到画布
                    await this._placeImage(data.image_url);
                    if (VC.Log) VC.Log.add('ai', `✅ 图片已生成并放置到画布`);

                    // 记录到图层
                    VC.State.addObject({
                        shape: 'image',
                        color: 'none',
                        size: 'large',
                        position: 'center',
                        tag: `AI: ${currentPrompt.substring(0, 10)}`,
                        opacity: 1
                    });

                    return true;
                } else if (data.status === 'pending' && data.task_id) {
                    // 异步任务，轮询结果
                    return await this._pollResult(data.task_id);
                } else {
                    throw new Error(data.message || '生成失败');
                }

            } catch (e) {
                console.error('[AIDraw] 生成失败:', e);
                if (VC.Log) VC.Log.add('ai', `❌ 生成失败: ${e.message}`);
                return false;
            } finally {
                isGenerating = false;
                this._hideGenerating();
            }
        },

        /**
         * 轮询异步任务结果
         */
        async _pollResult(taskId) {
            const maxAttempts = 60; // 最多轮询60次
            const interval = 2000;  // 每2秒一次

            for (let i = 0; i < maxAttempts; i++) {
                await new Promise(r => setTimeout(r, interval));

                try {
                    const resp = await fetch(VC.Config.API_BASE + `/image/task/${taskId}`);
                    const data = await resp.json();

                    if (data.status === 'success' && data.image_url) {
                        await this._placeImage(data.image_url);
                        if (VC.Log) VC.Log.add('ai', `✅ 图片已生成并放置到画布`);
                        return true;
                    } else if (data.status === 'failed') {
                        throw new Error(data.message || '生成失败');
                    }
                    // else: still pending, continue polling
                } catch (e) {
                    if (e.message !== '生成失败') {
                        console.warn('[AIDraw] 轮询出错:', e);
                    } else {
                        throw e;
                    }
                }
            }

            throw new Error('生成超时');
        },

        /**
         * 下载图片并放置到画布（Fabric.js 版本）
         */
        async _placeImage(imageUrl) {
            return new Promise((resolve, reject) => {
                if (!VCTools || !VCTools.canvas) {
                    reject(new Error('Fabric.js 未初始化'));
                    return;
                }

                const img = new Image();
                img.crossOrigin = 'anonymous';

                img.onload = () => {
                    // 计算放置位置和大小（居中，适应画布）
                    const canvasW = VCTools.canvas.width;
                    const canvasH = VCTools.canvas.height;
                    const maxSize = Math.min(canvasW, canvasH) * 0.6;
                    const ratio = img.width / img.height;

                    let w, h;
                    if (ratio > 1) {
                        w = maxSize;
                        h = maxSize / ratio;
                    } else {
                        h = maxSize;
                        w = maxSize * ratio;
                    }

                    // 使用 Fabric.js 添加图片
                    const fabricImg = new fabric.Image(img, {
                        left: canvasW / 2,
                        top: canvasH / 2,
                        originX: 'center',
                        originY: 'center',
                        scaleX: w / img.width,
                        scaleY: h / img.height,
                    });
                    fabricImg.id = 'ai_img_' + Date.now();
                    VCTools.canvas.add(fabricImg);
                    VCTools.canvas.renderAll();
                    VCTools.saveState();
                    resolve();
                };

                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = imageUrl;
            });
        },

        /**
         * 重新生成（使用上一次的 prompt）
         */
        async regenerate() {
            if (!currentPrompt) {
                if (VC.Log) VC.Log.add('ai', '⚠️ 没有可重新生成的描述');
                return false;
            }
            // 使用 Fabric.js 清空画布
            if (VCTools && VCTools.canvas) {
                VCTools.canvas.clear();
                VCTools.canvas.renderAll();
            }
            return await this.generate(currentPrompt);
        },

        /**
         * 处理语音输入（在 AI 绘图模式下）
         */
        async handleVoiceInput(text) {
            if (!this.isActive()) return false;

            // 检测是否是生成指令
            const generateKeywords = ['画', '生成', '创建', '帮我画', '来一个', '来一幅'];
            let prompt = text;

            // 去掉指令前缀，保留描述
            for (const kw of generateKeywords) {
                if (prompt.startsWith(kw)) {
                    prompt = prompt.substring(kw.length).trim();
                    break;
                }
            }

            if (prompt) {
                await this.generate(prompt);
                return true;
            }

            return false;
        },

        /**
         * 显示 prompt 输入条
         */
        _showPromptBar() {
            const bar = document.getElementById('aiPromptBar');
            if (bar) bar.classList.remove('hidden');

            const toggle = document.getElementById('aiDrawToggle');
            if (toggle) toggle.classList.add('active');
        },

        /**
         * 隐藏 prompt 输入条
         */
        _hidePromptBar() {
            const bar = document.getElementById('aiPromptBar');
            if (bar) bar.classList.add('hidden');

            const toggle = document.getElementById('aiDrawToggle');
            if (toggle) toggle.classList.remove('active');
        },

        /**
         * 显示生成中状态
         */
        _showGenerating() {
            const btn = document.getElementById('aiGenerateBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            const overlay = document.getElementById('generatingOverlay');
            if (overlay) overlay.classList.remove('hidden');
        },

        /**
         * 隐藏生成中状态
         */
        _hideGenerating() {
            const btn = document.getElementById('aiGenerateBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
            }

            const overlay = document.getElementById('generatingOverlay');
            if (overlay) overlay.classList.add('hidden');
        }
    };

    console.log('[AIDraw] AI 绘图模块加载完成');
})();
