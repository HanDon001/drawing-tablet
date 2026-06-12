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
         */
        async processText(text) {
            // 检测快通道
            const fastCmd = VC.Parser.detectFastCommand(text);
            if (fastCmd) {
                switch (fastCmd) {
                    case 'undo': return this.undo();
                    case 'clear': return this.clearAll();
                    case 'delete': return this.deleteShape();
                }
            }

            // 慢通道解析
            const intent = VC.Parser.parseIntent(text);
            const result = this.executeIntent(intent);

            // 语音播报
            if (VC.Voice && intent.reply) {
                await VC.Voice.speak(intent.reply);
            }

            return result;
        }
    };

    console.log('[Cmd] 命令执行器加载完成');
})();
