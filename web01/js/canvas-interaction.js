/**
 * VC.CanvasInteraction — 画布交互适配层（VCTools 版本）
 * 所有操作委托给 VCTools（Fabric.js）
 */
(function () {
    'use strict';

    // ── 工具切换（委托给 VCTools）──────────────────────────

    function setDrawTool(tool) {
        if (VCTools) VCTools.setTool(tool);
    }

    function toolAction(type, val) {
        if (!VCTools) return;
        if (type === 'draw') {
            VCTools.currentFill = val;
        } else if (type === 'size') {
            // 大小通过属性面板设置
        }
    }

    function setBrushSize(v) {
        if (VCTools) VCTools.setBrushSize(v);
    }

    // ── 右键菜单（委托给 VCTools）──────────────────────────

    function ctxMenuSetColor(c) { if (VCTools) VCTools.setCtxColor(c); }
    function ctxMenuDelete() { if (VCTools) VCTools.ctxMenuDelete(); }
    function ctxMenuDuplicate() { if (VCTools) VCTools.ctxMenuDuplicate(); }
    function ctxMenuRemoveStroke() {
        const obj = VCTools?.canvas?.getActiveObject();
        if (obj) { obj.set('stroke', 'transparent'); VCTools.canvas.renderAll(); }
        VCTools?.closeContextMenu();
    }
    function ctxMenuAddStroke() {
        const obj = VCTools?.canvas?.getActiveObject();
        if (obj) { obj.set('stroke', '#333333'); obj.set('strokeWidth', 2); VCTools.canvas.renderAll(); }
        VCTools?.closeContextMenu();
    }
    function ctxMenuChangeColor() { /* 颜色盘已在菜单中 */ }
    function ctxMenuResize(px) { if (VCTools) VCTools.ctxMenuResize(px); }
    function closeCtxMenu() { if (VCTools) VCTools.closeContextMenu(); }

    // ── 兼容旧接口 ──────────────────────────────────────────

    function init() {
        // VCTools 已在 app.js 中初始化，这里不需要再初始化
        console.log('[CanvasInteraction] 适配层加载完成（VCTools 模式）');
    }

    // ── 公开 API ──────────────────────────────────────────

    VC.CanvasInteraction = {
        init,
        setDrawTool,
        toolAction,
        setBrushSize,

        // 右键菜单
        ctxMenuSetColor,
        ctxMenuDelete,
        ctxMenuDuplicate,
        ctxMenuRemoveStroke,
        ctxMenuAddStroke,
        ctxMenuChangeColor,
        ctxMenuResize,
        closeCtxMenu,

        // 兼容旧接口 - 全部委托给 VCTools
        get objects() { return VCTools ? VCTools.getObjects() : []; },
        set objects(v) { /* VCTools 管理自己的对象 */ },
        redrawAll() { if (VCTools?.canvas) VCTools.canvas.renderAll(); },
        addShape(shape, fill, pos) {
            if (!VCTools) return null;
            return VCTools.createShape(shape, { fill: fill });
        },

        // 属性访问器
        get currentDrawTool() { return VCTools ? VCTools.canvas?.isDrawingMode ? 'pen' : 'select' : 'select'; },
        get currentFill() { return VCTools ? VCTools.currentFill : 'none'; },
        set currentFill(v) { if (VCTools) VCTools.currentFill = v; },
        get currentStroke() { return VCTools ? VCTools.currentStroke : '#333333'; },
        set currentStroke(v) { if (VCTools) VCTools.currentStroke = v; },
    };

    // 全局兼容
    window.closeCtxMenu = closeCtxMenu;
    window.ctxMenuSetColor = ctxMenuSetColor;
    window.ctxMenuDelete = ctxMenuDelete;
    window.ctxMenuDuplicate = ctxMenuDuplicate;
    window.ctxMenuRemoveStroke = ctxMenuRemoveStroke;
    window.ctxMenuAddStroke = ctxMenuAddStroke;
    window.ctxMenuChangeColor = ctxMenuChangeColor;
    window.ctxMenuResize = ctxMenuResize;

    console.log('[CanvasInteraction] 模块加载完成');
})();
