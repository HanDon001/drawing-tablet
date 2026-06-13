/**
 * VC.App — 应用入口
 * 从 index.html 内联 JS 拆分
 * 负责：色板初始化、工具栏控制、菜单、模块启动路由、演示模式
 */
(function () {
    'use strict';

    const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#333333', '#FFFFFF'];

    /* ========== 色板初始化 ========== */
    function initSwatches() {
        ['brushSwatches', 'fillSwatches', 'strokeSwatches'].forEach(id => {
            const el = document.getElementById(id); if (!el) return; el.innerHTML = '';
            if (id === 'fillSwatches') {
                const noneBtn = document.createElement('div');
                noneBtn.className = 'swatch active';
                noneBtn.style.background = 'white'; noneBtn.style.position = 'relative';
                noneBtn.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(45deg);width:90%;height:2px;background:red;"></div>';
                noneBtn.title = '无填充';
                noneBtn.onclick = () => {
                    el.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
                    noneBtn.classList.add('active');
                    VC.CanvasInteraction.currentFill = 'none';
                };
                el.appendChild(noneBtn);
            }
            COLORS.forEach(c => {
                const d = document.createElement('div');
                const isActive = (c === '#333333' && id === 'brushSwatches') || (c === '#333333' && id === 'strokeSwatches');
                d.className = 'swatch' + (isActive ? ' active' : '');
                d.style.background = c; if (c === '#FFFFFF') d.style.border = '1px solid #ddd';
                d.onclick = () => {
                    el.querySelectorAll('.swatch').forEach(s => s.classList.remove('active')); d.classList.add('active');
                    if (id === 'brushSwatches') VC.CanvasInteraction.currentBrushColor = c;
                    else if (id === 'fillSwatches') VC.CanvasInteraction.currentFill = c;
                    else VC.CanvasInteraction.currentStroke = c;
                };
                el.appendChild(d);
            });
        });
    }

    /* ========== 工具栏 ========== */
    function togglePanel(id) {
        const p = document.getElementById(id), a = document.getElementById(id + 'Arrow');
        if (!p) return;
        if (p.style.display === 'none') { p.style.display = ''; a && a.classList.add('open'); }
        else { p.style.display = 'none'; a && a.classList.remove('open'); }
    }

    function setDrawTool(tool) {
        VC.CanvasInteraction.currentDrawTool = tool;
        document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
        document.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
        if (VC.State) VC.State.currentTool = tool;
    }

    function toolAction(type, val) {
        if (type === 'draw') {
            VC.CanvasInteraction.currentShape = val;
            VC.CanvasInteraction.currentDrawTool = 'shape';
            document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('active', b.dataset.shape === val));
            document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
            if (VC.State) { VC.State.currentTool = 'shape'; VC.State.currentShape = val; }
        }
        else if (type === 'size') {
            VC.CanvasInteraction.currentSize = val;
            document.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', b.dataset.size === val));
        }
        else if (type === 'opacity') {
            VC.CanvasInteraction.currentOpacity = parseFloat(val);
            document.querySelectorAll('[data-opacity]').forEach(b => b.classList.toggle('active', b.dataset.opacity === val));
        }
        else if (type === 'position') {
            VC.CanvasInteraction.currentPosition = val;
            document.querySelectorAll('[data-pos]').forEach(b => b.classList.toggle('active', b.dataset.pos === val));
        }
    }

    function setBrushSize(v) {
        VC.CanvasInteraction.brushSize = parseInt(v);
        document.getElementById('brushSizeLabel').textContent = v;
    }

    /* ========== 菜单 ========== */
    function openMenu() { document.getElementById('menuOverlay').classList.add('visible'); }
    function closeMenu() { document.getElementById('menuOverlay').classList.remove('visible'); }
    function closeMenuOutside(e) { if (e.target === document.getElementById('menuOverlay')) closeMenu(); }

    /* ========== 模块启动 ========== */
    function launchModule(mod) {
        closeMenu();
        if (mod === 'agent') {
            if (VC.AIMode.currentMode === 'ai') VC.AIMode.deactivateAIMode(); else VC.AIMode.activateAIMode();
        } else if (mod === 'multimodal') {
            if (VC.AIMode.currentMode === 'multi') VC.AIMode.deactivateMultiModal(); else VC.AIMode.activateMultiModal();
        } else if (mod === 'voice-draw') {
            VC.Speech.startListening(); VC.Chat.addChat('assistant', '语音绘图模式已开启，请说出绘图指令。');
        } else if (mod === 'demo') { runDemo(); }
        else if (mod === 'ai-draw') { document.getElementById('aiPromptBar').classList.toggle('hidden'); }
        else if (mod === 'theme') { VC.Chat.addChat('user', '帮我创作一幅自然风光主题的画'); if (VC.Cmd) VC.Cmd.processText('帮我创作一幅自然风光主题的画'); }
        else if (mod === 'describe') { VC.Chat.addChat('user', '描述一下画布上的内容'); if (VC.Cmd) VC.Cmd.processText('描述一下画布上的内容'); }
        else if (mod === 'optimize') { VC.Chat.addChat('user', '帮我优化一下画布布局'); if (VC.Cmd) VC.Cmd.processText('帮我优化一下画布布局'); }
        else { VC.Chat.addChat('assistant', `${mod} 模块正在开发中，敬请期待！`); }
    }

    function handleAIGenerate() {
        const input = document.getElementById('aiPromptInput'), text = input.value.trim();
        if (!text) return; input.value = '';
        if (typeof VC !== 'undefined' && VC.Cmd) { VC.Cmd.processText(text); }
        else { VC.Chat.addChat('user', `[AI绘图] ${text}`); VC.LocalCommands.processVoiceCommand(text); }
    }

    /* ========== 演示模式 ========== */
    async function runDemo() {
        VC.Chat.addChat('assistant', '创作演示开始，请观赏...');
        const steps = [
            { shape: 'circle', fill: '#EF4444', pos: 'center', text: '绘制红色圆形于中央' },
            { shape: 'rectangle', fill: '#3B82F6', pos: 'left_top', text: '绘制蓝色矩形于左上' },
            { shape: 'triangle', fill: '#22C55E', pos: 'right_bottom', text: '绘制绿色三角形于右下' },
            { shape: 'star', fill: '#EAB308', pos: 'top', text: '绘制黄色星形于上方' },
            { shape: 'diamond', fill: '#8B5CF6', pos: 'left', text: '绘制紫色菱形于左侧' },
        ];
        for (const step of steps) {
            await new Promise(r => setTimeout(r, 800));
            const saved = [VC.CanvasInteraction.currentFill, VC.CanvasInteraction.currentPosition, VC.CanvasInteraction.currentSize];
            VC.CanvasInteraction.currentFill = step.fill;
            VC.CanvasInteraction.currentPosition = step.pos;
            VC.CanvasInteraction.currentSize = 'medium';
            VC.CanvasInteraction.addShape(step.shape, step.fill, step.pos);
            [VC.CanvasInteraction.currentFill, VC.CanvasInteraction.currentPosition, VC.CanvasInteraction.currentSize] = saved;
            VC.Chat.addChat('assistant', step.text);
        }
        VC.Chat.addChat('assistant', '创作演示完成！');
    }

    /* ========== 初始化 ========== */
    function init() {
        initSwatches();
        VC.CanvasInteraction.init();
        VC.Chat.init();
        VC.Speech.init();
        VC.Effects.init();

        // ESC 关闭菜单
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

        console.log('[App] 应用初始化完成');
    }

    // ── 公开 API ──
    VC.App = {
        init, initSwatches, togglePanel, setDrawTool, toolAction, setBrushSize,
        openMenu, closeMenu, closeMenuOutside, launchModule,
        handleAIGenerate, runDemo
    };

    // 全局兼容（HTML onclick 等）
    window.openMenu = openMenu;
    window.closeMenu = closeMenu;
    window.closeMenuOutside = closeMenuOutside;
    window.launchModule = launchModule;
    window.handleAIGenerate = handleAIGenerate;
    window.runDemo = runDemo;
    window.togglePanel = togglePanel;
    window.setDrawTool = setDrawTool;
    window.toolAction = toolAction;
    window.setBrushSize = setBrushSize;
    window.agentRunning = false;

    // DOMContentLoaded 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 50);
    }

    console.log('[App] 应用入口模块加载完成');
})();
