/**
 * VC.LocalCommands — 本地命令回退
 * 从 index.html 内联 JS 拆分
 * 负责：当 LLM 不可用时的本地语音命令处理
 */
(function () {
    'use strict';

    const shapeMap = {
        '圆': 'circle', '圆形': 'circle', '圆圈': 'circle',
        '方': 'rectangle', '矩形': 'rectangle', '方形': 'rectangle',
        '三角': 'triangle', '三角形': 'triangle',
        '星': 'star', '星星': 'star', '星形': 'star',
        '菱形': 'diamond', '箭头': 'arrow', '六边形': 'hexagon',
        '线': 'line', '直线': 'line'
    };

    const colorMap = {
        '红': '#EF4444', '红色': '#EF4444',
        '蓝': '#3B82F6', '蓝色': '#3B82F6',
        '绿': '#22C55E', '绿色': '#22C55E',
        '黄': '#EAB308', '黄色': '#EAB308',
        '紫': '#8B5CF6', '紫色': '#8B5CF6',
        '橙': '#F97316', '橙色': '#F97316',
        '粉': '#EC4899', '粉色': '#EC4899',
        '白': '#FFFFFF', '白色': '#FFFFFF',
        '黑': '#333333', '黑色': '#333333',
        '青': '#06B6D4', '青色': '#06B6D4'
    };

    function processVoiceCommand(text) {
        const t = text.trim();
        let matched = false;

        if (t.includes('撤销') || t.includes('undo')) {
            VC.Cmd.undo(); matched = true;
        } else if (t.includes('清空') || t.includes('清除')) {
            VC.Cmd.clearAll(); matched = true;
        } else {
            let shape = null, color = null;
            for (const [k, v] of Object.entries(shapeMap)) {
                if (t.includes(k)) { shape = v; break; }
            }
            for (const [k, v] of Object.entries(colorMap)) {
                if (t.includes(k)) { color = v; break; }
            }
            if (shape) {
                const saved = VC.CanvasInteraction.currentFill;
                if (color) VC.CanvasInteraction.currentFill = color;
                VC.CanvasInteraction.addShape(shape, color);
                if (color) VC.CanvasInteraction.currentFill = saved;
                const cName = color ? Object.keys(colorMap).find(k => colorMap[k] === color) : '';
                const sName = Object.keys(shapeMap).find(k => shapeMap[k] === shape);
                VC.Chat.addChat('assistant', `已为你绘制${cName ? cName : ''}${sName}。`);
                matched = true;
            }
        }

        if (!matched && t.length > 1) {
            VC.Chat.addChat('assistant', `收到指令："${t}"，我正在理解中...`);
        }
    }

    // ── 公开 API ──
    VC.LocalCommands = { processVoiceCommand };

    // 全局兼容
    window.processVoiceCommand = processVoiceCommand;

    console.log('[LocalCommands] 本地命令模块加载完成');
})();
