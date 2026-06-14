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
                case 'draw_shape':          return this.drawShape(params);
                // 操控
                case 'set_active_tool':     return this.setActiveTool(params);
                case 'set_brush_params':    return this.setBrushParams(params);
                case 'draw_freehand_path':  return this.drawFreehandPath(params);
                case 'trigger_ui_action':   return this.triggerUIAction(params);
                case 'delete_object':       return this.deleteObjectById(params);
                case 'draw_preset_pattern': return this.drawPresetPattern(params);
                case 'draw_multiple':   return this.drawMultiple(params);
                // 编辑
                case 'edit_shape':      return this.editShape(params);
                case 'move_shape':      return this.moveShape(params);
                case 'resize_shape':    return this.resizeShape(params);
                case 'set_opacity':     return this.setOpacity(params);
                case 'set_stroke':      return this.setStroke(params);
                case 'rotate_shape':    return this.rotateShape(params);
                case 'reorder_layer':   return this.reorderShape(params);
                // 删除
                case 'delete_shape':    return this.deleteShape(params);
                case 'delete_by_tag':   return this.deleteByTag(params);
                case 'delete_all':      return this.clearAll();
                // 保存
                case 'save_as_png':     return this.saveAsPNG(params);
                case 'save_as_svg':     return this.saveAsSVG(params);
                // 编组
                case 'group_objects':   return this.groupSelected();
                case 'group_by_tag':   return this.groupByTag(params);
                case 'ungroup_objects': return this.ungroupSelected();
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
                // 矢量图形
                case 'add_vector_shape':  return this.addVectorShape(params);
                case 'draw_svg_path':     return this.drawSvgPath(params);
                case 'generate_vector_art': return this.generateVectorArt(action);
                // Fabric.js
                case 'inject_fabric_json': return this.injectFabricJson(action);
                case 'create_fabric_object': return this.createFabricObject(action);
                default:
                    console.warn('[Cmd] 未知工具:', tool);
                    return false;
            }
        },

        // ─── 绘制 ─────────────────────────────────────

        /**
         * 绘制图形（Fabric.js 版本）
         */
        drawShape(params) {
            if (!VCTools || !VCTools.canvas) {
                console.warn('[Cmd] Fabric.js 未初始化');
                return false;
            }

            // 颜色转换
            let color = params.color || '无';
            if (VC.Config.COLOR_MAP[color]) color = VC.Config.COLOR_MAP[color];
            if (color === '无' || color === 'none') color = 'transparent';

            let strokeColor = params.stroke_color || params.strokeColor || '无';
            if (VC.Config.COLOR_MAP[strokeColor]) strokeColor = VC.Config.COLOR_MAP[strokeColor];
            if (strokeColor === '无' || strokeColor === 'none') strokeColor = 'transparent';

            // 尺寸转换
            const sizeMap = { small: 40, medium: 80, large: 140 };
            const size = typeof params.size === 'number' ? params.size : (sizeMap[params.size] || 80);

            // 坐标转换
            const canvasW = VCTools.canvas.width;
            const canvasH = VCTools.canvas.height;

            // 位置名称 → 坐标比例
            const posMap = {
                'left_top': [0.15, 0.15], 'top': [0.5, 0.15], 'right_top': [0.85, 0.15],
                'left': [0.15, 0.5], 'center': [0.5, 0.5], 'right': [0.85, 0.5],
                'left_bottom': [0.15, 0.85], 'bottom': [0.5, 0.85], 'right_bottom': [0.85, 0.85]
            };

            let left, top;
            if (params.x !== undefined && params.y !== undefined) {
                // 有坐标：可能是 0-1 或像素
                left = params.x;
                top = params.y;
                if (left <= 1 && top <= 1) {
                    left = left * canvasW;
                    top = top * canvasH;
                }
            } else if (params.position && posMap[params.position]) {
                // 有位置名称
                const [rx, ry] = posMap[params.position];
                left = rx * canvasW;
                top = ry * canvasH;
            } else {
                // 默认居中
                left = canvasW / 2;
                top = canvasH / 2;
            }

            const shapeType = params.shape_type || params.shape || 'circle';
            const obj = VCTools.createShape(shapeType, {
                left: left,
                top: top,
                size: size,
                fill: color,
                stroke: strokeColor,
                strokeWidth: params.stroke_width || params.strokeWidth || 2,
                opacity: params.opacity !== undefined ? params.opacity : 1,
                angle: params.rotation || 0,
                tag: params.tag || null,
            });

            if (obj && VC.Log) {
                const shapeName = SHAPE_NAMES[shapeType] || shapeType;
                VC.Log.add('cmd', `绘制: ${color}${shapeName}`);
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
         * 编辑图形属性（Fabric.js 版本）
         */
        editShape(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;

            // 构建更新内容
            const updates = {};
            let newColor = params.new_color || params.newColor;
            if (newColor !== undefined) {
                updates.fill = VC.Config.COLOR_MAP[newColor] || newColor;
            }
            if (params.new_size) {
                const sizeMap = { small: 40, medium: 80, large: 140 };
                const s = typeof params.new_size === 'number' ? params.new_size : (sizeMap[params.new_size] || 80);
                updates.scaleX = s / 80;
                updates.scaleY = s / 80;
            }
            if (params.new_opacity !== undefined) updates.opacity = params.new_opacity;
            if (params.newOpacity !== undefined) updates.opacity = params.newOpacity;
            let strokeColor = params.new_stroke_color || params.newStrokeColor;
            if (strokeColor !== undefined) {
                updates.stroke = VC.Config.COLOR_MAP[strokeColor] || strokeColor;
            }
            if (params.new_stroke_width !== undefined) updates.strokeWidth = params.new_stroke_width;
            if (params.newStrokeWidth !== undefined) updates.strokeWidth = params.newStrokeWidth;
            if (params.new_tag) updates.tag = params.new_tag;

            // 按 tag 批量修改所有匹配对象
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            VC.State.saveHistory();
            let count = 0;
            targets.forEach(obj => {
                if (VCTools.updateObject(obj, updates)) count++;
            });

            if (VC.Log) VC.Log.add('cmd', `已修改 ${count} 个: ${tag}`);
            return count > 0;
        },

        /**
         * 移动图形
         */
        moveShape(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            const canvasW = VCTools.canvas.width;
            const canvasH = VCTools.canvas.height;
            const hasCoords = params.x !== undefined && params.y !== undefined;

            VC.State.saveHistory();

            let updates;
            if (hasCoords) {
                updates = { left: params.x * canvasW, top: params.y * canvasH };
            } else {
                const posMap = {
                    center: [0.5, 0.5], left_top: [0.25, 0.25], top: [0.5, 0.25], right_top: [0.75, 0.25],
                    left: [0.25, 0.5], right: [0.75, 0.5],
                    left_bottom: [0.25, 0.75], bottom: [0.5, 0.75], right_bottom: [0.75, 0.75]
                };
                const pos = posMap[params.position || 'center'] || posMap.center;
                updates = { left: pos[0] * canvasW, top: pos[1] * canvasH };
            }

            let count = 0;
            targets.forEach(obj => {
                if (VCTools.updateObject(obj, updates)) count++;
            });

            if (VC.Log) {
                const label = hasCoords ? `(${params.x},${params.y})` : (POS_NAMES[params.position] || params.position);
                VC.Log.add('cmd', `移动${tag}: ${count}个对象 → ${label}`);
            }

            return count > 0;
        },

        /**
         * 调整大小
         */
        resizeShape(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            VC.State.saveHistory();
            let count = 0;
            targets.forEach(obj => {
                if (VC.State.updateObject(obj.id, { size: params.size })) count++;
            });

            if (VC.Log) VC.Log.add('cmd', `调整大小${tag}: ${count}个对象 → ${params.size}`);
            return count > 0;
        },

        /**
         * 设置透明度
         */
        setOpacity(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            VC.State.saveHistory();
            let count = 0;
            targets.forEach(obj => {
                if (VC.State.updateObject(obj.id, { opacity: params.opacity })) count++;
            });

            if (VC.Log) VC.Log.add('cmd', `透明度${tag}: ${count}个对象 → ${params.opacity}`);
            return count > 0;
        },

        /**
         * 设置边框
         */
        setStroke(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            const updates = {};
            if (params.stroke_color) updates.strokeColor = params.stroke_color;
            if (params.stroke_width) updates.strokeWidth = params.stroke_width;

            VC.State.saveHistory();
            let count = 0;
            targets.forEach(obj => {
                if (VC.State.updateObject(obj.id, updates)) count++;
            });

            if (VC.Log) VC.Log.add('cmd', `边框${tag}: ${count}个对象 → ${params.stroke_color}`);
            return count > 0;
        },

        /**
         * 旋转图形
         */
        rotateShape(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            const angle = params.angle || 0;
            VC.State.saveHistory();
            let count = 0;
            targets.forEach(obj => {
                if (VC.State.updateObject(obj.id, { rotation: angle })) count++;
            });

            if (VC.Log) VC.Log.add('cmd', `旋转${tag}: ${count}个对象 → ${angle}°`);
            return count > 0;
        },

        /**
         * 调整图层顺序
         */
        reorderShape(params) {
            const tag = params.target_tag || params.targetId;
            if (!tag) return false;
            const objs = VCTools ? VCTools.getObjects() : [];
            const targets = objs.filter(o => o.tag && o.tag.includes(tag));
            if (targets.length === 0) return false;

            const canvas = VCTools.canvas;
            const direction = params.direction || 'forward';
            VC.State.saveHistory();

            targets.forEach(obj => {
                switch (direction) {
                    case 'front': canvas.bringToFront(obj); break;
                    case 'back': canvas.sendToBack(obj); break;
                    case 'forward': canvas.bringForward(obj); break;
                    case 'backward': canvas.sendBackwards(obj); break;
                }
            });
            canvas.renderAll();

            if (VC.Log) VC.Log.add('cmd', `图层${tag}: ${direction} (${targets.length}个对象)`);
            return true;
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

            const name = obj.tag || obj.type;
            const success = VCTools.removeObject(obj);

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

            // 使用 VCLayer API 操作图层
            if (typeof VCLayer === 'undefined') return false;

            switch (params.direction) {
                case 'front':
                    VCLayer.bringToFront(obj);
                    break;
                case 'back':
                    VCLayer.sendToBack(obj);
                    break;
                case 'forward':
                    VCLayer.bringForward(obj);
                    break;
                case 'backward':
                    VCLayer.sendBackward(obj);
                    break;
            }

            if (VC.Log) {
                VC.Log.add('cmd', `图层调整: ${obj.tag || obj.shape} → ${params.direction}`);
            }

            return true;
        },

        /**
         * 按标签批量删除图形
         */
        deleteByTag(params) {
            const tag = params.target_tag;
            if (!tag) return false;

            const objs = VCTools ? VCTools.getObjects() : [];
            const toDelete = objs.filter(o => {
                if (!o.tag) return false; // 无标签的对象不匹配
                const objTag = o.tag.toLowerCase();
                const searchTag = tag.toLowerCase();
                return objTag.includes(searchTag);
            });

            if (toDelete.length === 0) {
                if (VC.Log) VC.Log.add('cmd', `未找到: ${tag}`);
                return false;
            }

            VC.State.saveHistory();

            toDelete.forEach(obj => {
                if (VCTools && VCTools.canvas) {
                    VCTools.canvas.remove(obj);
                }
            });

            if (VCTools && VCTools.canvas) {
                VCTools.canvas.renderAll();
            }

            if (VC.Log) {
                VC.Log.add('cmd', `删除: ${tag} (${toDelete.length}个)`);
            }

            return true;
        },

        /**
         * 保存为 PNG
         */
        saveAsPNG(params) {
            if (!VCTools || !VCTools.canvas) return false;
            VCTools.saveAsPNG();
            if (VC.Log) VC.Log.add('cmd', '已保存为 PNG');
            return true;
        },

        /**
         * 保存为 SVG
         */
        saveAsSVG(params) {
            if (!VCTools || !VCTools.canvas) return false;
            VCTools.saveAsSVG();
            if (VC.Log) VC.Log.add('cmd', '已保存为 SVG');
            return true;
        },

        /**
         * 编组
         */
        groupSelected() {
            if (!VCTools) return false;
            VCTools.groupSelected();
            return true;
        },

        /**
         * 解组
         */
        ungroupSelected() {
            if (!VCTools) return false;
            VCTools.ungroupSelected();
            return true;
        },

        /**
         * 按标签编组
         */
        groupByTag(params) {
            const tag = params.target_tag;
            if (!tag || !VCTools || !VCTools.canvas) return false;

            const objs = VCTools.canvas.getObjects();
            const toGroup = objs.filter(o => {
                const objTag = (o.tag || '').toLowerCase();
                const searchTag = tag.toLowerCase();
                return objTag.includes(searchTag) || searchTag.includes(objTag);
            });

            if (toGroup.length < 2) {
                if (VC.Log) VC.Log.add('cmd', `需要至少2个图形才能编组`);
                return false;
            }

            // 选中所有匹配的图形
            const sel = new fabric.ActiveSelection(toGroup, { canvas: VCTools.canvas });
            VCTools.canvas.setActiveObject(sel);

            // 编组
            VCTools.groupSelected();

            // 设置编组的标签
            const group = VCTools.canvas.getActiveObject();
            if (group) {
                group.tag = tag;
                group.id = 'group_' + Date.now();
            }

            if (VC.Log) VC.Log.add('cmd', `编组: ${tag} (${toGroup.length}个)`);
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
            VCTools.clearAll();
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
                const canvasW = VCTools ? VCTools.canvas.width : 800;
                const canvasH = VCTools ? VCTools.canvas.height : 600;
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
            const prompt = params.prompt || params.description || '';
            const style = params.style || 'realistic';

            console.log('[Cmd] aiGenerateImage 被调用:', params);

            // 直接调用后端图片生成接口
            try {
                const resp = await fetch(VC.Config.API_BASE + '/image/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, style, size: '1024*1024' })
                });

                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }

                const data = await resp.json();
                console.log('[Cmd] 图片生成响应:', data);

                if (data.status === 'success' && data.image_url) {
                    // 加载图片并添加到画布
                    this._addImageToCanvas(data.image_url, prompt);
                    return true;
                } else {
                    console.error('[Cmd] 图片生成失败:', data);
                    return false;
                }
            } catch (e) {
                console.error('[Cmd] 图片生成异常:', e);
                return false;
            }
        },

        /**
         * 添加图片到画布
         */
        _addImageToCanvas(imageUrl, prompt) {
            if (!VCTools || !VCTools.canvas) {
                console.error('[Cmd] VCTools.canvas 未初始化');
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                console.log('[Cmd] 图片加载成功:', img.width, 'x', img.height);
                const canvasW = VCTools.canvas.width;
                const canvasH = VCTools.canvas.height;
                const maxSize = Math.min(canvasW, canvasH) * 0.8;
                const ratio = img.width / img.height;
                const w = ratio > 1 ? maxSize : maxSize * ratio;
                const h = ratio > 1 ? maxSize / ratio : maxSize;

                const fabricImg = new fabric.Image(img, {
                    left: canvasW / 2,
                    top: canvasH / 2,
                    originX: 'center',
                    originY: 'center',
                    scaleX: w / img.width,
                    scaleY: h / img.height,
                });
                fabricImg.id = 'ai_img_' + Date.now();
                fabricImg.tag = 'AI: ' + (prompt || '').substring(0, 10);
                VCTools.canvas.add(fabricImg);
                VCTools.canvas.renderAll();
                console.log('[Cmd] 图片已添加到画布');
            };
            img.onerror = (e) => {
                console.error('[Cmd] 图片加载失败:', imageUrl, e);
            };
            img.src = imageUrl;
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

        // ─── 矢量图形 ─────────────────────────────────

        /**
         * 添加参数化矢量图形
         */
        addVectorShape(params) {
            const shapeType = params.shape_type;
            if (!shapeType || !VC.Vector || !VC.Vector.hasType(shapeType)) {
                console.warn('[Cmd] 未知矢量类型:', shapeType);
                return false;
            }

            if (!VCTools || !VCTools.canvas) {
                console.warn('[Cmd] Fabric.js 未初始化');
                return false;
            }

            const scale = params.scale || 1;
            const size = 80 * scale;
            const svgPath = VC.Vector.generate(shapeType, size);
            if (!svgPath) return false;

            // 颜色转换
            let fillColor = params.fill_color || params.fill || '#333333';
            if (VC.Config.COLOR_MAP[fillColor]) fillColor = VC.Config.COLOR_MAP[fillColor];
            if (fillColor === '无' || fillColor === 'none') fillColor = 'transparent';
            let strokeColor = params.stroke_color || params.stroke || '#333333';
            if (VC.Config.COLOR_MAP[strokeColor]) strokeColor = VC.Config.COLOR_MAP[strokeColor];
            if (strokeColor === '无' || strokeColor === 'none') strokeColor = 'transparent';

            // 坐标：0-1 → 像素
            const canvasW = VCTools.canvas.width;
            const canvasH = VCTools.canvas.height;
            const x = params.x !== undefined ? params.x : 0.5;
            const y = params.y !== undefined ? params.y : 0.5;
            const left = x <= 1 ? x * canvasW : x;
            const top = y <= 1 ? y * canvasH : y;

            // 创建 Fabric Path 对象（直接用 SVG 字符串）
            const fabricPath = new fabric.Path(svgPath, {
                left: left,
                top: top,
                fill: fillColor,
                stroke: strokeColor,
                strokeWidth: params.stroke_width || 2,
                originX: 'center',
                originY: 'center',
                scaleX: scale,
                scaleY: scale,
                angle: params.rotation || 0,
            });

            fabricPath.id = 'vec_' + Date.now() + '_' + Math.random();
            VCTools.canvas.add(fabricPath);
            VCTools.canvas.setActiveObject(fabricPath);
            VCTools.canvas.renderAll();
            VCTools.saveState();

            // 同步到 VC.State
            if (VC.State) {
                VC.State.objects = objects;
                VC.State.selectedObjectId = obj.id;
                VC.State.emit('objectsChange', { action: 'add', object: obj });
            }

            VC.CanvasInteraction.redrawAll();

            if (VC.Log) {
                VC.Log.add('cmd', `矢量绘制: ${shapeType}`);
            }
            return obj;
        },

        /**
         * 绘制 SVG 路径
         */
        drawSvgPath(params) {
            if (!params.svg_d || !VC.Vector) return false;

            const pathData = VC.Vector.parseSVG(params.svg_d);
            if (!pathData) {
                console.warn('[Cmd] SVG 路径解析失败');
                return false;
            }

            // 颜色转换
            let fillColor = params.fill || 'none';
            if (VC.Config.COLOR_MAP[fillColor]) fillColor = VC.Config.COLOR_MAP[fillColor];
            let strokeColor = params.stroke || '#333333';
            if (VC.Config.COLOR_MAP[strokeColor]) strokeColor = VC.Config.COLOR_MAP[strokeColor];

            const scale = params.scale || 1;

            const obj = {
                id: 'svg_' + Date.now() + '_' + Math.random(),
                type: 'vector',
                shape: 'svg_path',
                pathData: pathData,
                size: 80 * scale,
                fill: fillColor,
                stroke: strokeColor,
                strokeWidth: params.stroke_width || 2,
                opacity: 1,
                x: params.x !== undefined ? params.x : 0.5,
                y: params.y !== undefined ? params.y : 0.5,
                rotation: 0,
                scale: scale
            };

            const objects = VC.CanvasInteraction.objects;
            objects.push(obj);

            if (VC.State) {
                VC.State.objects = objects;
                VC.State.selectedObjectId = obj.id;
                VC.State.emit('objectsChange', { action: 'add', object: obj });
            }

            VC.CanvasInteraction.redrawAll();

            if (VC.Log) {
                VC.Log.add('cmd', 'SVG 路径绘制完成');
            }
            return obj;
        },

        /**
         * AI 文生图 + 矢量化
         * 后端生成图片 → 提取轮廓 → 返回 SVG paths
         */
        generateVectorArt(action) {
            const result = action.result;
            if (!result || !result.paths || !Array.isArray(result.paths)) {
                console.warn('[Cmd] generate_vector_art: 无路径数据');
                return false;
            }

            const paths = result.paths;
            const canvasW = VCTools ? VCTools.canvas.width : 800;
            const canvasH = VCTools ? VCTools.canvas.height : 600;

            // 解析 SVG 路径中的所有坐标点，计算精确包围盒
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const svgD of paths) {
                // 提取所有数字对（坐标）
                const tokens = svgD.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+\.?\d*/g);
                if (!tokens) continue;
                let i = 0, cmd = 'M', px = 0, py = 0;
                while (i < tokens.length) {
                    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(tokens[i])) {
                        cmd = tokens[i]; i++;
                    }
                    switch (cmd) {
                        case 'M': case 'L': case 'T':
                            if (i + 1 < tokens.length) { px = parseFloat(tokens[i]); py = parseFloat(tokens[i + 1]); minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); i += 2; } else i++;
                            break;
                        case 'm': case 'l': case 't':
                            if (i + 1 < tokens.length) { px += parseFloat(tokens[i]); py += parseFloat(tokens[i + 1]); minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); i += 2; } else i++;
                            break;
                        case 'H':
                            if (i < tokens.length) { px = parseFloat(tokens[i]); minX = Math.min(minX, px); maxX = Math.max(maxX, px); i++; } else i++;
                            break;
                        case 'V':
                            if (i < tokens.length) { py = parseFloat(tokens[i]); minY = Math.min(minY, py); maxY = Math.max(maxY, py); i++; } else i++;
                            break;
                        case 'C':
                            while (i + 5 < tokens.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(tokens[i])) { i += 4; px = parseFloat(tokens[i]); py = parseFloat(tokens[i + 1]); minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); i += 2; } break;
                        case 'Q':
                            while (i + 3 < tokens.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(tokens[i])) { i += 2; px = parseFloat(tokens[i]); py = parseFloat(tokens[i + 1]); minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); i += 2; } break;
                        default:
                            i++; break;
                    }
                }
            }

            // 如果解析失败，用默认范围
            if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 512; maxY = 512; }

            const srcW = maxX - minX || 1;
            const srcH = maxY - minY || 1;
            // 目标：占画布 60%，保持宽高比
            const targetSize = Math.min(canvasW, canvasH) * 0.6;
            const scale = targetSize / Math.max(srcW, srcH);

            let count = 0;
            for (const svgD of paths) {
                try {
                    const pathData = new Path2D(svgD);
                    const obj = {
                        id: 'vart_' + Date.now() + '_' + Math.random(),
                        type: 'vector',
                        shape: 'svg_path',
                        pathData: pathData,
                        size: 80,
                        fill: '#333333',
                        stroke: 'none',
                        strokeWidth: 0,
                        opacity: 1,
                        x: 0.5,  // 画布中心
                        y: 0.5,
                        rotation: 0,
                        scale: scale,
                        _vectorArt: true,
                        _minX: minX,
                        _minY: minY,
                        _srcW: srcW,
                        _srcH: srcH,
                    };

                    const objects = VC.CanvasInteraction.objects;
                    objects.push(obj);
                    count++;
                } catch (e) {
                    console.warn('[Cmd] SVG path 解析失败:', e);
                }
            }

            if (count > 0) {
                // 同步到 VC.State
                if (VC.State) {
                    VC.State.objects = VC.CanvasInteraction.objects;
                    VC.State.emit('objectsChange', { action: 'add' });
                }
                VC.CanvasInteraction.redrawAll();
            }

            if (VC.Log) {
                VC.Log.add('cmd', `AI矢量图: ${count}条路径`);
            }
            return count > 0;
        },

        // ─── Fabric.js ─────────────────────────────────

        /**
         * 注入 Fabric.js JSON 到画布
         */
        injectFabricJson(action) {
            console.log('[Cmd] injectFabricJson 被调用:', action);

            if (!VCTools || !VCTools.canvas) {
                console.warn('[Cmd] Fabric.js 未初始化');
                return false;
            }

            // 提取数据：优先从 action.result.data，其次从 params
            let data = null;
            if (action.result && action.result.data) {
                data = action.result.data;
                console.log('[Cmd] 从 action.result.data 提取数据');
            } else if (action.params) {
                data = action.params.json_data || action.params.json;
                console.log('[Cmd] 从 action.params 提取数据');
            }

            if (!data) {
                console.warn('[Cmd] inject_fabric_json: 无数据', action);
                return false;
            }

            console.log('[Cmd] 提取的数据:', typeof data, data);

            try {
                const jsonData = typeof data === 'string' ? JSON.parse(data) : data;

                // 获取对象数组
                let objects = jsonData.objects || [jsonData];

                // 追加到画布（不清空）
                let addedCount = 0;
                objects.forEach(objData => {
                    const type = objData.type;
                    if (!type) return;

                    const opts = { ...objData };
                    delete opts.type;

                    // 创建 Fabric 对象
                    let obj = null;
                    // 提取 originX/originY，创建后单独设置
                    const originX = opts.originX || 'left';
                    const originY = opts.originY || 'top';
                    delete opts.originX;
                    delete opts.originY;

                    // 不做坐标转换，LLM 输出的像素坐标直接使用

                    switch (type) {
                        case 'rect':
                            obj = new fabric.Rect(opts);
                            break;
                        case 'circle':
                            obj = new fabric.Circle(opts);
                            break;
                        case 'ellipse':
                            obj = new fabric.Ellipse(opts);
                            break;
                        case 'triangle':
                            obj = new fabric.Triangle(opts);
                            break;
                        case 'text':
                        case 'i-text':
                            obj = new fabric.IText(opts.text || '文字', opts);
                            break;
                        case 'line':
                            obj = new fabric.Line([opts.x1 || 0, opts.y1 || 0, opts.x2 || 100, opts.y2 || 0], opts);
                            break;
                        case 'path':
                            if (opts.path) {
                                obj = new fabric.Path(opts.path, opts);
                            }
                            break;
                        case 'polygon':
                            if (opts.points) {
                                obj = new fabric.Polygon(opts.points, opts);
                            }
                            break;
                        default:
                            console.warn('[Cmd] 未知 Fabric 类型:', type);
                    }

                    if (obj) {
                        // 设置原点（创建后设置才有效）
                        obj.set({
                            originX: originX,
                            originY: originY,
                        });
                        obj.id = 'fab_' + Date.now() + '_' + Math.random();
                        VCTools.canvas.add(obj);
                        addedCount++;
                    }
                });

                if (addedCount > 0) {
                    VCTools.canvas.renderAll();
                    VCTools.saveState();
                }

                console.log('[Cmd] inject_fabric_json 追加:', addedCount, '个对象');

                if (VC.Log) {
                    VC.Log.add('cmd', `Fabric: ${addedCount}个对象`);
                }
                return addedCount > 0;

            } catch (e) {
                console.error('[Cmd] inject_fabric_json 解析失败:', e);
                return false;
            }
        },

        /**
         * 创建单个 Fabric.js 对象
         */
        createFabricObject(action) {
            if (!VCTools || !VCTools.canvas) {
                console.warn('[Cmd] Fabric.js 未初始化');
                return false;
            }

            // 提取数据：优先从 action.result.data，其次从 params
            let data = null;
            if (action.result && action.result.data) {
                data = action.result.data;
            } else if (action.params) {
                data = action.params;
            }

            if (!data) {
                console.warn('[Cmd] create_fabric_object: 无数据');
                return false;
            }

            try {
                // 如果是完整的 Fabric.js JSON（有 objects 数组），提取第一个对象
                let objData = data;
                if (data.objects && Array.isArray(data.objects)) {
                    objData = data.objects[0];
                }

                if (!objData || !objData.type) {
                    console.warn('[Cmd] create_fabric_object: 无效数据', objData);
                    return false;
                }

                const type = objData.type;
                const opts = { ...objData };
                delete opts.type;

                // 颜色转换
                if (opts.fill && VC.Config && VC.Config.COLOR_MAP[opts.fill]) {
                    opts.fill = VC.Config.COLOR_MAP[opts.fill];
                }
                if (opts.stroke && VC.Config && VC.Config.COLOR_MAP[opts.stroke]) {
                    opts.stroke = VC.Config.COLOR_MAP[opts.stroke];
                }

                // 创建对象
                const obj = VCTools.createShape(type, opts);

                if (obj && VC.Log) {
                    VC.Log.add('cmd', `Fabric: ${type}`);
                }
                return !!obj;

            } catch (e) {
                console.error('[Cmd] create_fabric_object 失败:', e);
                return false;
            }
        },

        // ─── 操控工具 ─────────────────────────────────

        /**
         * 切换当前工具
         */
        setActiveTool(params) {
            const tool = params.tool || 'pen';
            if (typeof setDrawTool === 'function') {
                setDrawTool(tool);
            } else {
                VC.State.currentTool = tool;
            }
            if (VC.Log) VC.Log.add('cmd', `切换工具: ${tool}`);
            return true;
        },

        /**
         * 设置画笔参数
         */
        setBrushParams(params) {
            if (params.color) {
                VC.State.brush = VC.State.brush || {};
                VC.State.brush.color = params.color;
                // 同步到全局变量
                if (typeof currentBrushColor !== 'undefined') currentBrushColor = params.color;
            }
            if (params.size) {
                VC.State.brush = VC.State.brush || {};
                VC.State.brush.size = params.size;
                if (typeof brushSize !== 'undefined') brushSize = params.size;
            }
            if (VC.Log) VC.Log.add('cmd', `画笔设置: ${params.color || ''} ${params.size || ''}`);
            return true;
        },

        /**
         * 自由路径绘制（Fabric.js 版本）
         */
        async drawFreehandPath(params) {
            let points = params.points;
            if (typeof points === 'string') {
                try { points = JSON.parse(points); } catch (e) { return false; }
            }
            if (!Array.isArray(points) || points.length < 2) return false;
            if (!VCTools || !VCTools.canvas) return false;

            const canvasW = VCTools.canvas.width;
            const canvasH = VCTools.canvas.height;

            // 将点转换为 Fabric.js Path 字符串
            let pathStr = `M ${(points[0].x || 0) * canvasW} ${(points[0].y || 0) * canvasH}`;
            for (let i = 1; i < points.length; i++) {
                const x = (points[i].x || 0) * canvasW;
                const y = (points[i].y || 0) * canvasH;
                pathStr += ` L ${x} ${y}`;
            }

            // 创建 Fabric.js Path 对象
            const color = params.color || '#333333';
            const width = params.size || 3;
            const path = new fabric.Path(pathStr, {
                fill: 'transparent',
                stroke: color,
                strokeWidth: width,
                strokeLineCap: 'round',
                strokeLineJoin: 'round',
                selectable: true,
            });

            VCTools.canvas.add(path);
            VCTools.canvas.renderAll();
            VCTools.saveState();

            if (VC.Log) {
                VC.Log.add('cmd', `自由路径: ${points.length}个点`);
            }
            return true;
        },

        /**
         * 触发UI动作
         */
        triggerUIAction(params) {
            const action = params.action;
            switch (action) {
                case 'undo': this.undo(); break;
                case 'clear_all': this.clearAll(); break;
                case 'redo': this.redo(); break;
                default:
                    console.warn('[Cmd] 未知UI动作:', action);
                    return false;
            }
            if (VC.Log) VC.Log.add('cmd', `UI动作: ${action}`);
            return true;
        },

        /**
         * 通过ID删除对象
         */
        deleteObjectById(params) {
            const id = params.object_id || params.id;
            if (!id) return false;
            const obj = VC.State.objects.find(o => o.id === id);
            if (!obj) return false;
            const success = VC.State.deleteObject(obj.id);
            if (success && VC.Log) VC.Log.add('cmd', `已删除: ${obj.tag || obj.shape}(${id})`);
            return success;
        },

        /**
         * 绘制预设图案
         */
        drawPresetPattern(params) {
            const pattern = params.pattern || 'flower';
            const x = params.x || 0.5;
            const y = params.y || 0.5;
            const scale = params.scale || 1;
            const color = params.color || '红';
            const colorHex = VC.Config.COLOR_MAP[color] || color;

            const generators = {
                flower: () => {
                    // 花瓣 + 花心
                    const petalCount = 5;
                    const petalSize = 30 * scale;
                    const centerSize = 15 * scale;
                    const results = [];
                    // 花心
                    results.push(this.drawShape({ shape_type: 'circle', color: '黄', size: 'small', x, y, tag: '花心', stroke_color: '无' }));
                    // 花瓣
                    for (let i = 0; i < petalCount; i++) {
                        const angle = (Math.PI * 2 / petalCount) * i - Math.PI / 2;
                        const px = x + Math.cos(angle) * 0.06 * scale;
                        const py = y + Math.sin(angle) * 0.06 * scale;
                        results.push(this.drawShape({ shape_type: 'circle', color: colorHex, size: 'small', x: px, y: py, stroke_color: '无' }));
                    }
                    return results;
                },
                tree: () => {
                    const results = [];
                    results.push(this.drawShape({ shape_type: 'rectangle', color: '#8B4513', size: 'small', x, y: y + 0.05, tag: '树干', stroke_color: '无' }));
                    results.push(this.drawShape({ shape_type: 'circle', color: '#22C55E', size: 'large', x, y: y - 0.03, tag: '树冠', stroke_color: '无' }));
                    return results;
                },
                house: () => {
                    const results = [];
                    results.push(this.drawShape({ shape_type: 'rectangle', color: '#8B4513', size: 'large', x, y, tag: '墙', stroke_color: '无' }));
                    results.push(this.drawShape({ shape_type: 'triangle', color: '#A0522D', size: 'medium', x, y: y - 0.06, tag: '屋顶', stroke_color: '无' }));
                    results.push(this.drawShape({ shape_type: 'rectangle', color: '#87CEEB', size: 'small', x: x - 0.03, y, tag: '窗户', stroke_color: '无' }));
                    results.push(this.drawShape({ shape_type: 'rectangle', color: '#654321', size: 'small', x: x + 0.03, y, tag: '门', stroke_color: '无' }));
                    return results;
                },
                heart: () => {
                    const results = [];
                    const s = 0.03 * scale;
                    results.push(this.drawShape({ shape_type: 'circle', color: colorHex, size: 'small', x: x - s, y: y - s, stroke_color: '无' }));
                    results.push(this.drawShape({ shape_type: 'circle', color: colorHex, size: 'small', x: x + s, y: y - s, stroke_color: '无' }));
                    results.push(this.drawShape({ shape_type: 'triangle', color: colorHex, size: 'small', x, y: y + s, stroke_color: '无' }));
                    return results;
                },
                star: () => {
                    return [this.drawShape({ shape_type: 'star', color: colorHex, size: 'large', x, y, tag: '星星', stroke_color: '无' })];
                },
            };

            const gen = generators[pattern];
            if (!gen) return false;
            const results = gen();
            if (VC.Log) VC.Log.add('cmd', `预设图案: ${pattern}`);
            return results.length > 0;
        },

        /**
         * 批量执行动作（带动画延迟和数量限制）
         */
        async executeActions(actions) {
            const MAX_ACTIONS = 10;
            const safeActions = actions.slice(0, MAX_ACTIONS);
            const results = [];

            for (const action of safeActions) {
                console.log(`[Execute] ${action.tool}`, action.params);
                const result = this.execute(action);
                results.push(result);
                await new Promise(r => setTimeout(r, 200));
            }

            return results;
        },

        // ─── 内部方法 ─────────────────────────────────

        /**
         * 解析目标图形（支持 tag、id、指代词）
         */
        _resolveTarget(ref) {
            if (!ref) {
                // 默认选中当前选中的对象
                if (VCTools && VCTools.canvas) {
                    return VCTools.canvas.getActiveObject();
                }
                return null;
            }

            const objs = VCTools ? VCTools.getObjects() : [];
            if (objs.length === 0) return null;

            // 按 tag 精确查找
            let obj = objs.find(o => o.tag === ref);
            if (obj) return obj;

            // 按 tag 模糊查找（ref 包含在 tag 中，如"树"匹配"树干"）
            obj = objs.find(o => o.tag && o.tag.includes(ref));
            if (obj) return obj;

            // 按 id 查找
            obj = objs.find(o => o.id === ref);
            if (obj) return obj;

            // 指代词处理：返回最后创建的对象
            if (['它', '这个', '那个', '刚才', '最后', '刚才画的'].some(w => ref.includes(w))) {
                return objs[objs.length - 1];
            }

            // 按颜色查找（如"红色的圆"）
            const colorMap = { '红': '#EF4444', '蓝': '#3B82F6', '绿': '#10B981', '黄': '#F59E0B', '紫': '#8B5CF6', '橙': '#F97316', '粉': '#EC4899', '黑': '#1F2937', '白': '#FFFFFF' };
            for (const [cn, hex] of Object.entries(colorMap)) {
                if (ref.includes(cn)) {
                    const found = objs.find(o => o.fill === hex || o.color === hex);
                    if (found) return found;
                }
            }

            // 按形状查找（如"圆形"、"矩形"）
            const shapeMap = { '圆': 'circle', '方': 'rectangle', '矩': 'rectangle', '三角': 'triangle', '星': 'star', '线': 'line', '菱': 'diamond', '箭头': 'arrow', '六边': 'hexagon' };
            for (const [cn, en] of Object.entries(shapeMap)) {
                if (ref.includes(cn)) {
                    const found = objs.find(o => o.type === en || o.shape === en);
                    if (found) return found;
                }
            }

            // 兜底：返回最后创建的对象
            return objs[objs.length - 1];
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
            // 如果 companion 模式激活，跳过（companion 自己处理）
            if (window.agentRunning) {
                console.log('[Cmd] companion 模式激活，跳过 processText');
                return;
            }

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
         * 构建增强画布上下文：工具状态 + 画笔参数 + 对象列表(含ID)
         */
        _buildCanvasContext() {
            // 优先从 Fabric.js canvas 读取对象（更准确）
            let objs = [];
            if (VCTools && VCTools.canvas) {
                const fabricObjects = VCTools.canvas.getObjects();
                objs = fabricObjects.map((o, i) => ({
                    id: o.id || `fab_${i}`,
                    shape: o.type || 'unknown',
                    color: o.fill || '#333',
                    size: o.radius ? `${Math.round(o.radius)}px` : (o.width ? `${Math.round(o.width)}x${Math.round(o.height)}px` : 'medium'),
                    x: o.left / VCTools.canvas.width,
                    y: o.top / VCTools.canvas.height,
                    rotation: o.angle || 0,
                    tag: o.tag || o.id || '',
                }));
            } else {
                objs = VC.State.objects || [];
            }

            const canvasW = VCTools ? VCTools.canvas.width : 800;
            const canvasH = VCTools ? VCTools.canvas.height : 600;

            // 1. 工具状态
            const toolState = `当前工具:${VC.State.currentTool || 'select'}, 画笔颜色:${VC.State.brush?.color || '#333'}, 笔刷大小:${VC.State.brush?.size || 3}`;

            // 2. 对象列表（包含位置信息，避免重叠）
            const objectsDesc = objs.length === 0 ? '画布为空' : objs.map((o, i) => {
                let posDesc;
                if (o.x !== undefined && o.y !== undefined) {
                    posDesc = `(${o.x.toFixed(2)},${o.y.toFixed(2)})`;
                } else {
                    posDesc = POS_NAMES[o.position] || o.position;
                }
                const shape = SHAPE_NAMES[o.shape] || o.shape;
                const tag = o.tag ? ` tag="${o.tag}"` : '';
                const rot = o.rotation ? ` rot=${Math.round(o.rotation)}°` : '';
                const size = typeof o.size === 'string' ? o.size : `${o.size}px`;
                return `id=${o.id} ${shape}${tag} ${posDesc} ${o.color} ${size}${rot}`;
            }).join('; ');

            return `画布${canvasW}x${canvasH}。${toolState}。对象: ${objectsDesc}`;
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
