/**
 * VC.Parser - 意图解析器
 * 解析用户文本指令为结构化命令
 */
(function() {
    'use strict';

    VC.Parser = {
        /**
         * 检测快通道命令（本地立即执行）
         */
        detectFastCommand(text) {
            if (['撤销', '撤回'].some(k => text.includes(k))) return 'undo';
            if (['清空', '清除'].some(k => text.includes(k))) return 'clear';
            if (['删除'].some(k => text.includes(k))) return 'delete';
            return null;
        },

        /**
         * 解析意图
         */
        parseIntent(text) {
            const result = {
                tool: 'unknown',
                params: {},
                reply: '未理解该指令。'
            };

            // 判断是否为编辑操作
            const editKeywords = ['变', '改', '换', '移', '填充', '描边', '透明', '无'];
            const isEdit = editKeywords.some(k => text.includes(k));

            if (isEdit && VC.State.selectedObjectId) {
                return this._parseEditIntent(text);
            }

            // 判断是否为绘制操作
            const drawKeywords = ['画', '加', '创建', '放'];
            const isDraw = drawKeywords.some(k => text.includes(k));

            if (isDraw) {
                return this._parseDrawIntent(text);
            }

            return result;
        },

        /**
         * 解析绘制意图
         */
        _parseDrawIntent(text) {
            const result = {
                tool: 'draw_shape',
                params: {
                    shape: 'circle',
                    color: '#1F2937',
                    size: 'medium',
                    position: 'center',
                    opacity: 1,
                    strokeColor: 'none'
                },
                reply: '已绘制。'
            };

            // 解析形状
            for (const [key, val] of Object.entries(VC.Config.SHAPE_MAP)) {
                if (text.includes(key)) {
                    result.params.shape = val;
                    break;
                }
            }

            // 解析颜色
            for (const [key, val] of Object.entries(VC.Config.COLOR_MAP)) {
                if (text.includes(key)) {
                    result.params.color = val;
                    break;
                }
            }

            // 解析大小
            for (const [key, val] of Object.entries(VC.Config.SIZE_MAP)) {
                if (text.includes(key)) {
                    result.params.size = val;
                    break;
                }
            }

            // 解析位置
            for (const [key, pos] of Object.entries(VC.Config.POSITION_MAP)) {
                if (text.includes(pos.label)) {
                    result.params.position = key;
                    break;
                }
            }

            return result;
        },

        /**
         * 解析编辑意图
         */
        _parseEditIntent(text) {
            const result = {
                tool: 'edit_shape',
                params: { targetId: VC.State.selectedObjectId },
                reply: '已修改。'
            };

            // 解析颜色
            for (const [key, val] of Object.entries(VC.Config.COLOR_MAP)) {
                if (text.includes(key)) {
                    result.params.newColor = val;
                    break;
                }
            }

            // 解析大小
            for (const [key, val] of Object.entries(VC.Config.SIZE_MAP)) {
                if (text.includes(key)) {
                    result.params.newSize = val;
                    break;
                }
            }

            // 解析位置
            for (const [key, pos] of Object.entries(VC.Config.POSITION_MAP)) {
                if (text.includes(pos.label)) {
                    result.params.newPosition = key;
                    break;
                }
            }

            // 解析透明度
            if (text.includes('透明')) {
                result.params.newOpacity = text.includes('不') ? 1 : 0.4;
            }

            // 解析描边
            if (text.includes('描边')) {
                result.params.newStrokeColor = result.params.newColor || '#1F2937';
            }

            // 无填充/无描边
            if (text.includes('无填充')) result.params.newColor = 'none';
            if (text.includes('无描边')) result.params.newStrokeColor = 'none';

            return result;
        }
    };

    console.log('[Parser] 意图解析器加载完成');
})();
