/**
 * VC.Cmd - 命令执行器（完整版）
 * AI Agent 可调用的全部画布操作
 */
(function() {
    'use strict';

    // 形状中文名映射
    const SHAPE_NAMES = {
        circle: '圆形', rectangle: '矩形', triangle: '三角形',
        line: '直线', star: '星形', diamond: '菱形',
        arrow: '箭头', hexagon: '六边形'
    };

    // 位置中文名映射
    const POS_NAMES = {
        center: '中间', left_top: '左上角', top: '上方', right_top: '右上角',
        left: '左边', right: '右边',
        left_bottom: '左下角', bottom: '下方', right_bottom: '右下角'
    };

    // 主题配置库
    const THEMES = {
        '星空': [
            { shape: 'circle', color: '#1E3A5F', size: 'large', position: 'center', tag: '夜空' },
            { shape: 'star', color: '#FFD700', size: 'small', position: 'left_top', tag: '星星1' },
            { shape: 'star', color: '#FFD700', size: 'small', position: 'right_top', tag: '星星2' },
            { shape: 'star', color: '#FFD700', size: 'small', position: 'left', tag: '星星3' },
            { shape: 'circle', color: '#F5F5DC', size: 'medium', position: 'right', tag: '月亮' }
        ],
        '太阳': [
            { shape: 'circle', color: '#FFD700', size: 'large', position: 'center', tag: '太阳' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'left_top', tag: '光线1' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'right_top', tag: '光线2' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'left_bottom', tag: '光线3' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'right_bottom', tag: '光线4' }
        ],
        '房子': [
            { shape: 'rectangle', color: '#8B4513', size: 'large', position: 'center', tag: '墙' },
            { shape: 'triangle', color: '#A0522D', size: 'medium', position: 'top', tag: '屋顶' },
            { shape: 'rectangle', color: '#87CEEB', size: 'small', position: 'left', tag: '窗户' },
            { shape: 'rectangle', color: '#654321', size: 'small', position: 'right', tag: '门' }
        ]
    };

    VC.Cmd = {
        /**
         * 执行命令 - 完整工具路由
         */
        execute(action) {
            const { tool, params } = action;
            switch (tool) {
                // 绘制
                case 'draw_shape':      return this.drawShape(params);
                case 'draw_multiple':   return this.drawMultiple(params);
                // 编辑
                case 'edit_shape':      return this.editShape(params);
                case 'move_shape':      return this.moveShape(params);
                case 'resize_shape':    return this.resizeShape(params);
                case 'set_opacity':     return this.setOpacity(params);
                case 'set_stroke':      return this.setStroke(params);
                // 删除
                case 'delete_shape':    return this.deleteShape(params);
                case 'delete_all':      return this.clearAll();
                // 查询
                case 'list_shapes':     return this.listShapes();
                case 'get_shape_info':  return this.getShapeInfo(params);
                case 'describe_canvas': return this.queryCanvas();
                // 操作
                case 'undo':            return this.undo();
                case 'redo':            return this.redo();
                case 'select_shape':    return this.selectShape(params);
                case 'duplicate_shape': return this.duplicateShape(params);
                case 'reorder_shape':   return this.reorderShape(params);
                // 主题
                case 'create_theme':    return this.createTheme(params);
                case 'list_themes':     return this.listThemes();
                // 画笔/填充/AI 绘图
                case 'pen_draw':          return this.penDraw(params);
                case 'fill_area':         return this.fillArea(params);
                case 'ai_generate_image': return this.aiGenerateImage(params);
                case 'ai_redraw_region':  return this.aiRedrawRegion(params);
                case 'set_drawing_mode':  return this.setDrawingMode(params);
                default:
                    console.warn('[Cmd] 未知工具:', tool);
                    return false;
            }
        },

        // ─── 绘制 ─────────────────────────────────────

        /**
         * 绘制图形
         */
        drawShape(params) {
            // 颜色转换：中文名 → 十六进制，默认为'none'（无填充）
            let color = params.color || '无';
            if (VC.Config.COLOR_MAP[color]) {
                color = VC.Config.COLOR_MAP[color];
            }

            // 坐标处理：x,y >= 0 时使用坐标，否则回退到 position 名称
            const hasCoords = params.x !== undefined && params.y !== undefined && params.x >= 0 && params.y >= 0;

            const obj = VC.State.addObject({
                shape: params.shape_type || params.shape || 'circle',
                color: color,
                size: params.size || 'medium',
                x: hasCoords ? params.x : undefined,
                y: hasCoords ? params.y : undefined,
                position: params.position || 'center',
                opacity: params.opacity !== undefined ? params.opacity : 1,
                strokeColor: params.stroke_color || params.strokeColor || '#1F2937',  // 默认黑色边框
                strokeWidth: params.stroke_width || params.strokeWidth || 2,
                tag: params.tag || null
            });

            if (VC.Log) {
                const shapeName = SHAPE_NAMES[obj.shape] || obj.shape;
                VC.Log.add('cmd', `绘制: ${obj.color}${shapeName}`);
            }

            return obj;
        },

        /**
         * 批量绘制
         */
        drawMultiple(params) {
            let shapes = params.shapes;
            if (typeof shapes === 'string') {
                try { shapes = JSON.parse(shapes); } catch (e) { return false; }
            }
            if (!Array.isArray(shapes)) return false;

            const results = [];
            for (const item of shapes) {
                results.push(this.drawShape(item));
            }

            if (VC.Log) {
                VC.Log.add('cmd', `批量绘制: ${results.length}个图形`);
            }
            return results;
        },

        // ─── 编辑 ─────────────────────────────────────

        /**
         * 编辑图形属性
         */
        editShape(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) {
                if (VC.Log) VC.Log.add('system', '⚠️ 未找到目标图形');
                return false;
            }

            const updates = {};
            // 颜色转换：中文名 → 十六进制
            let newColor = params.new_color || params.newColor;
            if (newColor !== undefined) {
                updates.color = VC.Config.COLOR_MAP[newColor] || newColor;
            }
            if (params.new_size) updates.size = params.new_size;
            if (params.newSize) updates.size = params.newSize;
            if (params.new_position) updates.position = params.new_position;
            if (params.newPosition) updates.position = params.newPosition;
            if (params.new_opacity !== undefined) updates.opacity = params.new_opacity;
            if (params.newOpacity !== undefined) updates.opacity = params.newOpacity;
            let strokeColor = params.new_stroke_color || params.newStrokeColor;
            if (strokeColor !== undefined) {
                updates.strokeColor = VC.Config.COLOR_MAP[strokeColor] || strokeColor;
            }
            if (params.new_stroke_width !== undefined) updates.strokeWidth = params.new_stroke_width;
            if (params.newStrokeWidth !== undefined) updates.strokeWidth = params.newStrokeWidth;
            if (params.new_tag) {
                updates.tag = params.new_tag;
            }

            const success = VC.State.updateObject(obj.id, updates);

            if (success && VC.Log) {
                VC.Log.add('cmd', `已修改: ${obj.tag || obj.shape}`);
            }

            return success;
        },

        /**
         * 移动图形
         */
        moveShape(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            const updates = {};
            const hasCoords = params.x !== undefined && params.y !== undefined && params.x >= 0 && params.y >= 0;
            if (hasCoords) {
                updates.x = params.x;
                updates.y = params.y;
            } else {
                updates.position = params.position || 'center';
            }

            const success = VC.State.updateObject(obj.id, updates);

            if (success && VC.Log) {
                const label = hasCoords ? `(${params.x},${params.y})` : (POS_NAMES[params.position] || params.position);
                VC.Log.add('cmd', `移动: ${obj.tag || obj.shape} → ${label}`);
            }

            return success;
        },

        /**
         * 调整大小
         */
        resizeShape(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            const success = VC.State.updateObject(obj.id, { size: params.size });

            if (success && VC.Log) {
                VC.Log.add('cmd', `调整大小: ${obj.tag || obj.shape} → ${params.size}`);
            }

            return success;
        },

        /**
         * 设置透明度
         */
        setOpacity(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            const success = VC.State.updateObject(obj.id, { opacity: params.opacity });

            if (success && VC.Log) {
                VC.Log.add('cmd', `透明度: ${obj.tag || obj.shape} → ${params.opacity}`);
            }

            return success;
        },

        /**
         * 设置边框
         */
        setStroke(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            const updates = {};
            if (params.stroke_color) updates.strokeColor = params.stroke_color;
            if (params.stroke_width) updates.strokeWidth = params.stroke_width;

            const success = VC.State.updateObject(obj.id, updates);

            if (success && VC.Log) {
                VC.Log.add('cmd', `边框: ${obj.tag || obj.shape} → ${params.stroke_color}`);
            }

            return success;
        },

        // ─── 删除 ─────────────────────────────────────

        /**
         * 删除图形
         */
        deleteShape(params) {
            const obj = this._resolveTarget(params?.target_tag || params?.targetId);
            if (!obj) {
                if (VC.Log) VC.Log.add('system', '⚠️ 未找到目标图形');
                return false;
            }

            const name = obj.tag || obj.shape;
            const success = VC.State.deleteObject(obj.id);

            if (success && VC.Log) {
                VC.Log.add('cmd', `已删除: ${name}`);
            }

            return success;
        },

        // ─── 查询 ─────────────────────────────────────

        /**
         * 列出所有图形
         */
        listShapes() {
            const objs = VC.State.objects || [];
            if (objs.length === 0) {
                return '画布为空，没有任何图形。';
            }

            const lines = objs.map((o, i) => {
                const shape = SHAPE_NAMES[o.shape] || o.shape;
                const pos = POS_NAMES[o.position] || o.position;
                const tag = o.tag ? `("${o.tag}")` : '';
                const opacity = o.opacity < 1 ? `，透明度${o.opacity}` : '';
                const stroke = o.strokeColor && o.strokeColor !== 'none' ? `，边框${o.strokeColor}` : '';
                return `${i + 1}. ${pos}的${o.color}${o.size}${shape}${tag}${opacity}${stroke}`;
            });

            const result = `画布上有${objs.length}个图形：\n${lines.join('\n')}`;

            if (VC.Log) {
                VC.Log.add('query', result);
            }

            return result;
        },

        /**
         * 获取指定图形信息
         */
        getShapeInfo(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return `未找到图形'${params.target_tag || params.targetId}'`;

            const shape = SHAPE_NAMES[obj.shape] || obj.shape;
            const pos = POS_NAMES[obj.position] || obj.position;
            const tag = obj.tag ? `，标签"${obj.tag}"` : '';
            const opacity = obj.opacity < 1 ? `，透明度${obj.opacity}` : '';
            const stroke = obj.strokeColor && obj.strokeColor !== 'none'
                ? `，边框${obj.strokeColor}${obj.strokeWidth}px` : '';

            const result = `${obj.color}${obj.size}${shape}，位于${pos}${tag}${opacity}${stroke}`;

            if (VC.Log) {
                VC.Log.add('query', result);
            }

            return result;
        },

        // ─── 操作 ─────────────────────────────────────

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
         * 重做（暂未实现，预留接口）
         */
        redo() {
            if (VC.Log) {
                VC.Log.add('cmd', '重做功能开发中');
            }
            return false;
        },

        /**
         * 选中图形
         */
        selectShape(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            VC.State.select(obj.id);

            if (VC.Log) {
                VC.Log.add('cmd', `选中: ${obj.tag || obj.shape}`);
            }

            return true;
        },

        /**
         * 复制图形
         */
        duplicateShape(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            // 偏移位置
            const positionOrder = ['left_top', 'top', 'right_top', 'left', 'center', 'right', 'left_bottom', 'bottom', 'right_bottom'];
            let newPos = params.new_position;
            if (!newPos) {
                const idx = positionOrder.indexOf(obj.position);
                newPos = positionOrder[Math.min(idx + 1, positionOrder.length - 1)];
            }

            const newObj = VC.State.addObject({
                shape: obj.shape,
                color: obj.color,
                size: obj.size,
                position: newPos,
                opacity: obj.opacity,
                strokeColor: obj.strokeColor,
                strokeWidth: obj.strokeWidth,
                tag: params.new_tag || (obj.tag ? obj.tag + '_副本' : null)
            });

            if (VC.Log) {
                VC.Log.add('cmd', `复制: ${obj.tag || obj.shape}`);
            }

            return newObj;
        },

        /**
         * 调整图层顺序
         */
        reorderShape(params) {
            const obj = this._resolveTarget(params.target_tag || params.targetId);
            if (!obj) return false;

            const objs = VC.State.objects;
            const idx = objs.indexOf(obj);
            if (idx === -1) return false;

            VC.State.saveHistory();

            switch (params.direction) {
                case 'front':
                    objs.splice(idx, 1);
                    objs.push(obj);
                    break;
                case 'back':
                    objs.splice(idx, 1);
                    objs.unshift(obj);
                    break;
                case 'forward':
                    if (idx < objs.length - 1) {
                        objs.splice(idx, 1);
                        objs.splice(idx + 1, 0, obj);
                    }
                    break;
                case 'backward':
                    if (idx > 0) {
                        objs.splice(idx, 1);
                        objs.splice(idx - 1, 0, obj);
                    }
                    break;
            }

            VC.State.emit('objectsChange', { action: 'reorder' });

            if (VC.Log) {
                VC.Log.add('cmd', `图层调整: ${obj.tag || obj.shape} → ${params.direction}`);
            }

            return true;
        },

        // ─── 主题 ─────────────────────────────────────

        /**
         * 主题创作
         */
        createTheme(params) {
            const themeName = params.theme_name || params.themeName;
            const theme = THEMES[themeName];
            if (!theme) {
                if (VC.Log) VC.Log.add('cmd', `⚠️ 未知主题: ${themeName}`);
                return false;
            }

            // 清空画布后创建
            VC.State.clearAll();

            for (const item of theme) {
                this.drawShape(item);
            }

            if (VC.Log) {
                VC.Log.add('cmd', `🎨 主题创作: ${themeName}`);
            }

            return true;
        },

        /**
         * 列出可用主题
         */
        listThemes() {
            const names = Object.keys(THEMES);
            const result = `可用主题：${names.join('、')}`;

            if (VC.Log) {
                VC.Log.add('query', result);
            }

            return result;
        },

        // ─── 通用 ─────────────────────────────────────

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
         * 清空画布
         */
        clearAll() {
            VC.State.clearAll();

            if (VC.Log) {
                VC.Log.add('cmd', '已清空画布');
            }

            return true;
        },

        // ─── 画笔/填充/AI 绘图 ───────────────────────────

        /**
         * 画笔绘制（由 AI 下发的笔画数据）
         */
        penDraw(params) {
            if (typeof VC.Drawing === 'undefined') return false;

            // AI 下发笔画数据时，逐帧绘制
            const brush = VC.State.brush;
            if (params.color) brush.color = params.color;
            if (params.size) brush.size = params.size;

            // 如果有笔画数据，解析并模拟绘制
            if (params.strokes) {
                try {
                    const strokes = typeof params.strokes === 'string' ? JSON.parse(params.strokes) : params.strokes;
                    VC.State.currentTool = 'pen';
                    for (const stroke of strokes) {
                        if (stroke.points && stroke.points.length > 1) {
                            for (let i = 1; i < stroke.points.length; i++) {
                                VC.Drawing.drawLine(
                                    stroke.points[i - 1].x, stroke.points[i - 1].y,
                                    stroke.points[i].x, stroke.points[i].y
                                );
                            }
                        }
                    }
                    VC.State.currentTool = 'select';
                } catch (e) {
                    console.warn('[Cmd] 笔画数据解析失败:', e);
                }
            }

            if (VC.Log) {
                VC.Log.add('cmd', '画笔绘制完成');
            }
            return true;
        },

        /**
         * 填充颜色
         */
        fillArea(params) {
            const color = params.color || '红';
            const colorHex = VC.Config.COLOR_MAP[color] || color;

            // 如果指定了target_tag或targetId，直接填充形状
            const targetTag = params.target_tag || params.targetId;
            if (targetTag) {
                const obj = this._resolveTarget(targetTag);
                if (obj) {
                    obj.fill = colorHex;
                    obj.color = colorHex;
                    if (VC.Log) VC.Log.add('cmd', `填充: ${obj.tag || obj.shape} → ${color}`);
                    return true;
                }
            }

            // 如果指定了坐标，检测是否有形状在该位置
            if (params.x !== undefined && params.y !== undefined) {
                const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : 800;
                const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : 600;
                const px = params.x * canvasW;
                const py = params.y * canvasH;

                // 检测是否命中形状
                for (let i = VC.State.objects.length - 1; i >= 0; i--) {
                    const obj = VC.State.objects[i];
                    const cx = obj.x !== undefined ? obj.x * canvasW : canvasW * (VC.Config.POSITION_MAP[obj.position] || { x: 0.5, y: 0.5 }).x;
                    const cy = obj.y !== undefined ? obj.y * canvasH : canvasH * (VC.Config.POSITION_MAP[obj.position] || { x: 0.5, y: 0.5 }).y;
                    const base = VC.Config.CANVAS_BASE_SIZE;
                    const sizeMul = obj.size === 'small' ? 1 : obj.size === 'large' ? 3 : 2;
                    const sz = base * sizeMul;
                    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
                    if (dist <= sz * 1.2) {
                        obj.fill = colorHex;
                        obj.color = colorHex;
                        if (VC.Log) VC.Log.add('cmd', `填充: ${obj.tag || obj.shape} → ${color}`);
                        return true;
                    }
                }

                // 如果没有命中形状，进行floodFill
                if (typeof VC.Drawing !== 'undefined') {
                    VC.State.brush.color = colorHex;
                    VC.Drawing.floodFill(params.x, params.y);
                }
            }

            if (VC.Log) VC.Log.add('cmd', `填充: ${color}`);
            return true;
        },

        /**
         * AI 生成图片
         */
        async aiGenerateImage(params) {
            if (typeof VC.AIDraw === 'undefined') return false;

            const prompt = params.prompt || params.description || '';
            const style = params.style || 'realistic';

            VC.AIDraw.activate();
            return await VC.AIDraw.generate(prompt, style);
        },

        /**
         * AI 重新绘制区域
         */
        async aiRedrawRegion(params) {
            if (typeof VC.AIDraw === 'undefined') return false;

            const prompt = params.prompt || '';
            return await VC.AIDraw.generate(prompt);
        },

        /**
         * 设置绘画模式
         */
        setDrawingMode(params) {
            if (typeof VC.AIDraw === 'undefined') return false;

            if (params.enabled) {
                VC.AIDraw.activate();
            } else {
                VC.AIDraw.deactivate();
            }

            if (VC.Log) {
                VC.Log.add('cmd', params.enabled ? 'AI 绘图模式已开启' : 'AI 绘图模式已关闭');
            }
            return true;
        },

        // ─── 内部方法 ─────────────────────────────────

        /**
         * 解析目标图形（支持 tag、id、指代词）
         */
        _resolveTarget(ref) {
            if (!ref) {
                // 默认选中当前选中的对象
                return VC.State.getSelected();
            }

            const objs = VC.State.objects || [];

            // 按 tag 查找
            let obj = objs.find(o => o.tag === ref);
            if (obj) return obj;

            // 按 id 查找
            obj = objs.find(o => o.id === ref);
            if (obj) return obj;

            // 指代词处理
            if (['它', '这个', '那个', '刚才', '最后'].some(w => ref.includes(w))) {
                return VC.State.getSelected();
            }

            // 按形状名查找（如"圆"、"方块"）
            const shapeMap = {
                '圆': 'circle', '方块': 'rectangle', '矩形': 'rectangle',
                '三角': 'triangle', '直线': 'line', '星': 'star',
                '菱': 'diamond', '箭头': 'arrow', '六边': 'hexagon'
            };
            for (const [cn, en] of Object.entries(shapeMap)) {
                if (ref.includes(cn)) {
                    const found = objs.find(o => o.shape === en);
                    if (found) return found;
                }
            }

            return null;
        },

        /**
         * 执行解析后的意图（向后兼容）
         */
        executeIntent(intent) {
            return this.execute(intent);
        },

        /**
         * 处理文本指令
         * 优先快通道，其余全部走 LLM 理解
         */
        async processText(text) {
            // 聊天面板记录用户消息
            if (typeof addChatMessage === 'function') addChatMessage('user', text);

            // 快通道：本地关键词匹配
            const fastCmd = this._detectFastCommand(text);
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
                        this.execute(action);
                    }
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

            return objs.map(o => {
                let posDesc
                if (o.x !== undefined && o.y !== undefined) {
                    posDesc = `坐标(${o.x.toFixed(2)},${o.y.toFixed(2)})`
                } else {
                    posDesc = POS_NAMES[o.position] || o.position
                }
                const shape = SHAPE_NAMES[o.shape] || o.shape;
                const tag = o.tag ? `，叫"${o.tag}"` : '';
                const opacity = o.opacity < 1 ? `，透明度${o.opacity}` : '';
                return `${posDesc}有${o.color}${shape}${tag}${opacity}`;
            }).join('；');
        },

        /**
         * 快速命令检测（本地关键词）
         */
        _detectFastCommand(text) {
            const t = text.trim();
            if (/^(撤销|undo)$/i.test(t)) return 'undo';
            if (/^(清空|清除|clear)$/i.test(t)) return 'clear';
            if (/^(删除|delete)$/i.test(t)) return 'delete';
            return null;
        }
    };

    console.log('[Cmd] 命令执行器加载完成');
})();
