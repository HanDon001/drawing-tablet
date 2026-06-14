/**
 * VC.App — 应用入口
 * 负责：初始化、菜单、模块启动路由、演示模式
 */
(function () {
    'use strict';

    /* ========== 菜单 ========== */
    function openMenu() { document.getElementById('menuOverlay').classList.add('visible'); }
    function closeMenu() { document.getElementById('menuOverlay').classList.remove('visible'); }
    function closeMenuOutside(e) { if (e.target === document.getElementById('menuOverlay')) closeMenu(); }

    /* ========== 面板折叠 ========== */
    function togglePanel(id) {
        const p = document.getElementById(id), a = document.getElementById(id + 'Arrow');
        if (!p) return;
        if (p.style.display === 'none') { p.style.display = ''; a && a.classList.add('open'); }
        else { p.style.display = 'none'; a && a.classList.remove('open'); }
    }

    /* ========== 模块启动 ========== */
    function launchModule(mod) {
        closeMenu();
        if (mod === 'agent') {
            if (VC.AIMode.currentMode === 'ai') VC.AIMode.deactivateAIMode(); else VC.AIMode.activateAIMode();
        } else if (mod === 'multimodal') {
            if (VC.AIMode.currentMode === 'multi') VC.AIMode.deactivateMultiModal(); else VC.AIMode.activateMultiModal();
        } else if (mod === 'voice-draw') {
            if (VC.AIMode.currentMode !== 'normal') VC.AIMode.deactivateAIMode();
            VC.Speech.startListening();
            VC.Chat.addChat('assistant', '语音绘图模式已开启，请说出绘图指令。');
        } else if (mod === 'vector-draw') {
            if (VC.AIMode.currentMode !== 'ai') VC.AIMode.activateAIMode();
            setTimeout(() => {
                VC.Chat.addChat('assistant', '矢量画图模式已激活！告诉我你想画什么，我会用矢量图形为你绘制。');
            }, 500);
        } else if (mod === 'demo') { runDemo(); }
        else if (mod === 'optimize') { VC.Chat.addChat('user', '帮我优化一下画布布局'); if (VC.Cmd) VC.Cmd.processText('帮我优化一下画布布局'); }
        else { VC.Chat.addChat('assistant', `${mod} 模块正在开发中，敬请期待！`); }
    }

    /* ========== 演示模式 ========== */
    async function runDemo() {
        VC.Chat.addChat('assistant', '创作演示开始，请观赏...');
        const canvas = VCTools.canvas;
        const steps = [
            { type: 'rect', opts: { left: 400, top: 200, width: 120, height: 80, fill: '#EF4444', rx: 12, ry: 12 }, text: '绘制红色圆角矩形' },
            { type: 'ellipse', opts: { left: 200, top: 300, rx: 50, ry: 50, fill: '#3B82F6' }, text: '绘制蓝色椭圆' },
            { type: 'rect', opts: { left: 600, top: 400, width: 100, height: 100, fill: '#22C55E' }, text: '绘制绿色矩形' },
        ];
        for (const step of steps) {
            await new Promise(r => setTimeout(r, 800));
            let obj;
            if (step.type === 'rect') obj = new fabric.Rect(step.opts);
            else if (step.type === 'ellipse') obj = new fabric.Ellipse(step.opts);
            if (obj) {
                obj.id = 'demo_' + Date.now();
                canvas.add(obj);
                canvas.renderAll();
            }
            VC.Chat.addChat('assistant', step.text);
        }
        VC.Chat.addChat('assistant', '创作演示完成！');
    }

    /* ========== 初始化 ========== */
    function init() {
        // 初始化 Figma 工具系统
        if (VCTools) {
            VCTools.init();
            console.log('[App] FigmaTools 已初始化');
        }

        // 初始化聊天模块
        if (VC.Chat) VC.Chat.init();

        // 初始化语音识别
        if (VC.Speech) VC.Speech.init();

        // 初始化视觉效果
        if (VC.Effects) VC.Effects.init();

        // ESC 关闭菜单
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

        console.log('[App] 应用初始化完成');
    }

    // ── 公开 API ──
    VC.App = {
        init, openMenu, closeMenu, closeMenuOutside,
        togglePanel, launchModule, runDemo
    };

    // 全局兼容
    window.openMenu = openMenu;
    window.closeMenu = closeMenu;
    window.closeMenuOutside = closeMenuOutside;
    window.launchModule = launchModule;
    window.togglePanel = togglePanel;
    window.agentRunning = false;

    // DOMContentLoaded 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 50);
    }

    console.log('[App] 模块加载完成');
})();
