/**
 * VC.Cmd - 命令执行器
 * 提供所有绘图操作的统一接口
 */
(function() {
    'use strict';

    VC.Cmd = {
        /**
         * 执行命令
         */
        execute(action) {
            switch (action.tool) {
                case 'draw_shape':
                    return this.drawShape(action.params);
                case 'edit_shape':
                    return this.editShape(action.params);
                case 'delete_shape':
                    return this.deleteShape(action.params);
                default:
                    console.warn('[Cmd] 未知工具:', action.tool);
                    return false;
            }
        },

        /**
         * 绘制图形
         */
        drawShape(params) {
            const obj = VC.State.addObject({
                shape: params.shape || 'circle',
                color: params.color || '#1F2937',
                size: params.size || 'medium',
                position: params.position || 'center',
                opacity: params.opacity || 1,
                strokeColor: params.strokeColor || 'none',
                tag: params.tag || null
            });

            if (VC.Log) {
                const shapeName = VC.Config.SHAPE_NAMES[obj.shape] || obj.shape;
                VC.Log.add('cmd', `绘制: ${shapeName}`);
            }

            return obj;
        },

        /**
         * 编辑图形
         */
        editShape(params) {
            const id = params.targetId || VC.State.selectedObjectId;
            if (!id) {
                if (VC.Log) VC.Log.add('system', '⚠️ 请先选择对象');
                return false;
            }

            const updates = {};
            if (params.newColor !== undefined) updates.color = params.newColor;
            if (params.newSize) updates.size = params.newSize;
            if (params.newPosition) updates.position = params.newPosition;
            if (params.newOpacity !== undefined) updates.opacity = params.newOpacity;
            if (params.newStrokeColor !== undefined) updates.strokeColor = params.newStrokeColor;

            const success = VC.State.updateObject(id, updates);

            if (success && VC.Log) {
                VC.Log.add('cmd', '已修改图形');
            }

            return success;
        },

        /**
         * 删除图形
         */
        deleteShape(params) {
            const id = params?.targetId || VC.State.selectedObjectId;
            if (!id) {
                if (VC.Log) VC.Log.add('system', '⚠️ 请先选择对象');
                return false;
            }

            const success = VC.State.deleteObject(id);

            if (success && VC.Log) {
                VC.Log.add('cmd', '已删除图形');
            }

            return success;
        },

        /**
         * 撤销
         */
        undo() {
            const success = VC.State.undo();

            if (VC.Log) {
                VC.Log.add('cmd', success ? '已撤销' : '无法撤销');
            }

            return success;
        },

        /**
         * 清空画布
         */
        clearAll() {
            VC.State.clearAll();

            if (VC.Log) {
                VC.Log.add('cmd', '已清空画布');
            }

            return true;
        },

        /**
         * 查询画布
         */
        queryCanvas() {
            const context = VC.State.toContextString();

            if (VC.Log) {
                VC.Log.add('query', context);
            }

            return context;
        },

        /**
         * 执行解析后的意图
         */
        executeIntent(intent) {
            if (intent.tool === 'draw_shape') {
                return this.drawShape(intent.params);
            } else if (intent.tool === 'edit_shape') {
                return this.editShape(intent.params);
            }
            return false;
        },

        /**
         * 处理文本指令
         * 优先快通道，其余全部走 LLM 理解
         */
        async processText(text) {
            // 聊天面板记录用户消息
            if (typeof addChatMessage === 'function') addChatMessage('user', text);

            // 快通道：本地直接执行
            const fastCmd = VC.Parser.detectFastCommand(text);
            if (fastCmd) {
                let reply = '';
                switch (fastCmd) {
                    case 'undo': this.undo(); reply = '已撤销'; break;
                    case 'clear': this.clearAll(); reply = '已清空画布'; break;
                    case 'delete': this.deleteShape(); reply = '已删除'; break;
                }
                if (reply) {
                    if (typeof addChatMessage === 'function') addChatMessage('assistant', reply);
                    if (VC.Voice) await VC.Voice.speak(reply);
                }
                return;
            }

            // 慢通道：调用 LLM 理解意图
            try {
                if (typeof showTyping === 'function') showTyping();

                const canvasCtx = this._buildCanvasContext();
                const resp = await fetch(VC.Config.API_BASE + '/interpret', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, canvas_context: canvasCtx })
                });
                const data = await resp.json();

                if (typeof hideTyping === 'function') hideTyping();

                // 执行动作
                if (data.actions && data.actions.length > 0) {
                    for (const action of data.actions) {
                        this._executeLLMAction(action);
                    }
                    VC.Canvas.render();
                }

                // 聊天面板记录 AI 回复
                if (data.reply) {
                    if (typeof addChatMessage === 'function') addChatMessage('assistant', data.reply);
                    if (VC.Voice) await VC.Voice.speak(data.reply);
                }
            } catch (e) {
                if (typeof hideTyping === 'function') hideTyping();
                console.error('[Cmd] LLM 调用失败:', e);
                const errMsg = '抱歉，我没太听清，你能再说一次吗？';
                if (typeof addChatMessage === 'function') addChatMessage('assistant', errMsg);
                if (VC.Voice) await VC.Voice.speak(errMsg);
            }
        },

        /**
         * 构建画布上下文描述
         */
        _buildCanvasContext() {
            const objs = VC.State.objects || [];
            if (objs.length === 0) return '画布为空';

            const posNames = { center: '中间', left_top: '左上角', right_top: '右上角', left_bottom: '左下角', right_bottom: '右下角' };
            const shapeNames = { circle: '圆', rectangle: '方块', triangle: '三角形', line: '线', star: '星', diamond: '菱形', arrow: '箭头', hexagon: '六边形' };

            return objs.map(o => {
                const pos = posNames[o.position] || o.position;
                const shape = shapeNames[o.shape] || o.shape;
                const tag = o.tag ? `，叫"${o.tag}"` : '';
                return `${pos}有${o.color}${shape}${tag}`;
            }).join('；');
        },

        /**
         * 执行 LLM 返回的动作
         */
        _executeLLMAction(action) {
            const { tool, params } = action;
            if (tool === 'draw_shape') {
                const pos = VC.Canvas.parsePosition(params.position || 'center');
                const size = VC.Canvas.parseSize(params.size || 'medium');
                this.drawShape({
                    shape: params.shape_type || 'circle',
                    color: params.color || 'black',
                    x: pos.x, y: pos.y,
                    width: size.w, height: size.h,
                    tag: params.tag
                });
            } else if (tool === 'edit_shape') {
                const obj = (VC.State.objects || []).find(o => o.tag === params.target_tag || o.id === params.target_tag);
                if (obj) {
                    if (params.new_color) obj.color = params.new_color;
                    if (params.new_size) { const s = VC.Canvas.parseSize(params.new_size); obj.width = s.w; obj.height = s.h; }
                    if (params.new_position) { const p = VC.Canvas.parsePosition(params.new_position); obj.x = p.x; obj.y = p.y; }
                    VC.State.emit('objectsChange');
                }
            } else if (tool === 'delete_shape') {
                const idx = (VC.State.objects || []).findIndex(o => o.tag === params.target_tag || o.id === params.target_tag);
                if (idx !== -1) { VC.State.objects.splice(idx, 1); VC.State.emit('objectsChange'); }
            }
        }
    };

    console.log('[Cmd] 命令执行器加载完成');
})();
