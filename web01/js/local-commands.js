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

        // 本地快速命令
        if (t.includes('撤销') || t.includes('undo')) {
            VC.Cmd.undo(); matched = true;
        } else if (t.includes('清空') || t.includes('清除')) {
            VC.Cmd.clearAll(); matched = true;
        } else {
            // 尝试匹配本地形状命令
            let shape = null, color = null;
            for (const [k, v] of Object.entries(shapeMap)) {
                if (t.includes(k)) { shape = v; break; }
            }
            for (const [k, v] of Object.entries(colorMap)) {
                if (t.includes(k)) { color = v; break; }
            }
            if (shape) {
                // 使用 VCTools 创建形状
                if (VCTools && VCTools.createShape) {
                    VCTools.createShape(shape, { fill: color || '#333333' });
                    const cName = color ? Object.keys(colorMap).find(k => colorMap[k] === color) : '';
                    const sName = Object.keys(shapeMap).find(k => shapeMap[k] === shape);
                    VC.Chat.addChat('assistant', `已为你绘制${cName ? cName : ''}${sName}。`);
                } else {
                    VC.Chat.addChat('assistant', '画布工具未就绪，请稍候再试。');
                }
                matched = true;
            }
        }

        // 本地命令不匹配，调用 LLM 处理
        if (!matched && t.length > 1) {
            VC.Chat.addChat('user', text);
            // 调用 LLM 接口
            console.log('[LocalCommands] 尝试调用 VC.Cmd:', typeof VC.Cmd, 'processText:', typeof VC.Cmd?.processText);
            if (typeof VC.Cmd !== 'undefined' && typeof VC.Cmd.processText === 'function') {
                VC.Cmd.processText(text).catch(err => {
                    console.error('[LocalCommands] processText 错误:', err);
                    VC.Chat.addChat('assistant', '处理出错了，请重试。');
                });
            } else {
                // 备用方案：直接调用 fetch
                console.log('[LocalCommands] VC.Cmd 不可用，直接调用 fetch');
                fetch('/ai/v1/interpret', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, canvas_context: '画布为空' })
                })
                .then(resp => resp.json())
                .then(data => {
                    if (data.reply) {
                        VC.Chat.addChat('assistant', data.reply);
                    }
                })
                .catch(err => {
                    console.error('[LocalCommands] fetch 错误:', err);
                    VC.Chat.addChat('assistant', 'AI 服务暂时不可用。');
                });
            }
        }
    }

    // ── 公开 API ──
    VC.LocalCommands = { processVoiceCommand };

    // 全局兼容
    window.processVoiceCommand = processVoiceCommand;

    console.log('[LocalCommands] 本地命令模块加载完成');
})();
