/**
 * VC.CanvasInteraction — 画布交互模块
 * 从 index.html 内联 JS 拆分
 * 负责：画布初始化、重绘、鼠标交互（拖拽/缩放/旋转）、右键菜单、图层列表
 */
(function () {
    'use strict';

    /* ========== 全局状态 ========== */
    let mainCanvas, mainCtx, drawCanvas, drawCtx;
    let objects = [];
    let currentShape = 'circle', currentFill = 'none', currentStroke = '#333333';
    let selectedObjId = null;
    let isResizing = false, resizeHandle = null;
    let currentBrushColor = '#333333', currentSize = 'medium', currentOpacity = 1;
    let currentPosition = 'center', currentDrawTool = 'pen', brushSize = 3;
    let isDrawing = false, lastX = 0, lastY = 0;
    let isDragging = false, dragTarget = null, dragOffsetX = 0, dragOffsetY = 0;
    let resizeStartX = 0, resizeStartY = 0, resizeStartSize = 0;
    let isRotating = false, rotateStartAngle = 0, rotateStartRotation = 0;
    let ctxTarget = null;

    const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#333333', '#FFFFFF'];

    function screenToCanvas(sx, sy) {
        if (VC.Viewport) return VC.Viewport.screenToCanvas(sx, sy);
        return { x: sx, y: sy };
    }
    function getCanvasSize() {
        if (VC.Viewport) return { w: VC.Viewport.getCanvasWidth(), h: VC.Viewport.getCanvasHeight() };
        return { w: mainCanvas.width, h: mainCanvas.height };
    }

    function redrawAll() {
        if (VC.Viewport) {
            VC.Viewport.beginFrame();
            const vctx = VC.Viewport.getCtx();
            objects.forEach(o => VC.ShapeRenderer.drawShape(vctx, o));
            VC.Viewport.endFrame();
        } else {
            mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            objects.forEach(o => VC.ShapeRenderer.drawShape(mainCtx, o));
        }
        const countEl = document.getElementById('objCountSide');
        if (countEl) countEl.textContent = objects.length;
        updateLayerList();
        const hint = document.getElementById('emptyHint');
        if (hint) hint.style.display = objects.length > 0 ? 'none' : '';
    }

    function addShape(shape, fill, pos) {
        const p = VC.ShapeRenderer.POSITIONS[pos || currentPosition] || VC.ShapeRenderer.POSITIONS.center;
        const sz = VC.ShapeRenderer.SIZES[currentSize] || 80;
        const obj = {
            id: 'obj_' + Date.now() + '_' + Math.random(),
            shape: shape || currentShape,
            fill: fill || currentFill,
            stroke: currentStroke,
            size: sz,
            opacity: currentOpacity,
            x: p[0] + (Math.random() - 0.5) * 0.05,
            y: p[1] + (Math.random() - 0.5) * 0.05
        };
        objects.push(obj);
        redrawAll();
        return obj;
    }

    function syncVCObjects() {
        if (typeof VC !== 'undefined' && VC.State) {
            VC.State.objects = objects;
            console.log('[Sync] VC.State.objects 已同步到本地 objects');
        }
    }

    function resizeCanvases() {
        const w = mainCanvas.parentElement.clientWidth, h = mainCanvas.parentElement.clientHeight;
        [mainCanvas, drawCanvas].forEach(c => { c.width = w; c.height = h; });
        if (VC.Viewport) VC.Viewport.resize();
        redrawAll();
    }

    /* ========== 鼠标事件 ========== */
    function onMouseDown(e) {
        const sx = e.offsetX, sy = e.offsetY;
        const pos = screenToCanvas(sx, sy);
        const x = pos.x, y = pos.y;
        const csize = getCanvasSize();
        const POSITIONS = VC.ShapeRenderer.POSITIONS;

        if (currentDrawTool === 'select' || currentDrawTool === 'shape') {
            if (selectedObjId) {
                const selectedObj = objects.find(o => o.id === selectedObjId);
                if (selectedObj) {
                    const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : mainCanvas.width;
                    const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : mainCanvas.height;
                    const cx = selectedObj.x !== undefined ? selectedObj.x * canvasW : canvasW * (POSITIONS[selectedObj.position] || POSITIONS.center)[0];
                    const cy = selectedObj.y !== undefined ? selectedObj.y * canvasH : canvasH * (POSITIONS[selectedObj.position] || POSITIONS.center)[1];
                    const s = VC.ShapeRenderer.resolveSize(selectedObj.size);
                    const halfW = s / 2;
                    const halfH = (selectedObj.shape === 'rectangle') ? s * 0.7 / 2 : halfW;
                    const rotRad = (selectedObj.rotation || 0) * Math.PI / 180;
                    const localHX = halfW + 18;
                    const localHY = halfH + 18;
                    const rhX = cx + localHX * Math.cos(rotRad) - localHY * Math.sin(rotRad);
                    const rhY = cy + localHX * Math.sin(rotRad) + localHY * Math.cos(rotRad);
                    if (Math.sqrt((x - rhX) ** 2 + (y - rhY) ** 2) <= 14) {
                        isRotating = true;
                        rotateStartAngle = Math.atan2(y - cy, x - cx);
                        rotateStartRotation = selectedObj.rotation || 0;
                        return;
                    }
                    const handle = VC.ShapeRenderer.hitTestResizeHandle(x, y, selectedObj);
                    if (handle) {
                        isResizing = true; resizeHandle = handle;
                        resizeStartX = x; resizeStartY = y;
                        resizeStartSize = VC.ShapeRenderer.resolveSize(selectedObj.size);
                        return;
                    }
                }
            }

            let hitObj = null;
            for (let i = objects.length - 1; i >= 0; i--) {
                const o = objects[i];
                const oPos = o.x !== undefined ? { x: o.x * csize.w, y: o.y * csize.h } :
                    (() => { const p = POSITIONS[o.position] || POSITIONS.center; return { x: csize.w * p[0], y: csize.h * p[1] }; })();
                const sz = VC.ShapeRenderer.resolveSize(o.size);
                const dx = x - oPos.x, dy = y - oPos.y;
                if (Math.sqrt(dx * dx + dy * dy) <= sz * 1.2) { hitObj = o; break; }
            }

            if (hitObj) {
                selectedObjId = hitObj.id;
                if (VC.State) VC.State.selectedObjectId = hitObj.id;
                isDragging = true; dragTarget = hitObj;
                const oPos = hitObj.x !== undefined ? { x: hitObj.x * csize.w, y: hitObj.y * csize.h } :
                    (() => { const p = POSITIONS[hitObj.position] || POSITIONS.center; return { x: csize.w * p[0], y: csize.h * p[1] }; })();
                dragOffsetX = x - oPos.x; dragOffsetY = y - oPos.y;
                if (hitObj.x === undefined) {
                    const p = POSITIONS[hitObj.position] || POSITIONS.center;
                    hitObj.x = p[0]; hitObj.y = p[1];
                }
                redrawAll(); return;
            }

            selectedObjId = null;
            if (VC.State) VC.State.selectedObjectId = null;

            if (currentDrawTool === 'shape') {
                const obj = { id: Date.now() + Math.random(), shape: currentShape, fill: currentFill, stroke: currentStroke, size: VC.ShapeRenderer.SIZES[currentSize] || 80, opacity: currentOpacity, x: x / csize.w, y: y / csize.h };
                objects.push(obj);
                selectedObjId = obj.id;
                if (VC.State) VC.State.selectedObjectId = obj.id;
                redrawAll(); return;
            }
            redrawAll(); return;
        }

        if (currentDrawTool === 'pen' || currentDrawTool === 'eraser') {
            isDrawing = true; [lastX, lastY] = [x, y];
        }

        if (currentDrawTool === 'fill') {
            let hitObj = null;
            for (let i = objects.length - 1; i >= 0; i--) {
                const o = objects[i];
                const oPos = o.x !== undefined ? { x: o.x * csize.w, y: o.y * csize.h } :
                    (() => { const p = POSITIONS[o.position] || POSITIONS.center; return { x: csize.w * p[0], y: csize.h * p[1] }; })();
                const sz = VC.ShapeRenderer.resolveSize(o.size);
                const dx = x - oPos.x, dy = y - oPos.y;
                if (Math.sqrt(dx * dx + dy * dy) <= sz * 1.2) { hitObj = o; break; }
            }
            if (hitObj) {
                hitObj.fill = currentBrushColor;
                hitObj.color = currentBrushColor;
                selectedObjId = hitObj.id;
                if (VC.State) VC.State.selectedObjectId = hitObj.id;
                redrawAll(); return;
            }
            if (VC.Drawing && VC.Drawing.floodFill) VC.Drawing.floodFill(x, y);
        }
    }

    function onMouseMove(e) {
        const sx = e.offsetX, sy = e.offsetY;
        const pos = screenToCanvas(sx, sy);
        const x = pos.x, y = pos.y;
        const csize = getCanvasSize();
        const POSITIONS = VC.ShapeRenderer.POSITIONS;

        if (isRotating && selectedObjId) {
            const obj = objects.find(o => o.id === selectedObjId);
            if (obj) {
                const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : mainCanvas.width;
                const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : mainCanvas.height;
                const cx = obj.x !== undefined ? obj.x * canvasW : canvasW * (POSITIONS[obj.position] || POSITIONS.center)[0];
                const cy = obj.y !== undefined ? obj.y * canvasH : canvasH * (POSITIONS[obj.position] || POSITIONS.center)[1];
                const angle = Math.atan2(y - cy, x - cx);
                const delta = (angle - rotateStartAngle) * 180 / Math.PI;
                obj.rotation = (rotateStartRotation + delta) % 360;
                redrawAll();
            }
            return;
        }

        if (isResizing && selectedObjId && resizeHandle) {
            const obj = objects.find(o => o.id === selectedObjId);
            if (obj) {
                const dx = x - resizeStartX, dy = y - resizeStartY;
                const deltaMap = { se: dx + dy, nw: -(dx + dy), ne: dx - dy, sw: dy - dx, s: dy, n: -dy, e: dx, w: -dx };
                const delta = deltaMap[resizeHandle] || 0;
                obj.size = Math.max(10, resizeStartSize + delta);
                redrawAll();
            }
            return;
        }

        if (isDragging && dragTarget) {
            dragTarget.x = Math.max(0, Math.min(1, (x - dragOffsetX) / csize.w));
            dragTarget.y = Math.max(0, Math.min(1, (y - dragOffsetY) / csize.h));
            redrawAll(); return;
        }

        if (currentDrawTool === 'select' || currentDrawTool === 'shape' || currentDrawTool === 'fill') {
            if (selectedObjId && currentDrawTool !== 'fill') {
                const selectedObj = objects.find(o => o.id === selectedObjId);
                if (selectedObj) {
                    const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : mainCanvas.width;
                    const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : mainCanvas.height;
                    const cx = selectedObj.x !== undefined ? selectedObj.x * canvasW : canvasW * (POSITIONS[selectedObj.position] || POSITIONS.center)[0];
                    const cy = selectedObj.y !== undefined ? selectedObj.y * canvasH : canvasH * (POSITIONS[selectedObj.position] || POSITIONS.center)[1];
                    const s = VC.ShapeRenderer.resolveSize(selectedObj.size);
                    const halfW = s / 2;
                    const halfH = (selectedObj.shape === 'rectangle') ? s * 0.7 / 2 : halfW;
                    const rotRad = (selectedObj.rotation || 0) * Math.PI / 180;
                    const localHX = halfW + 18;
                    const localHY = halfH + 18;
                    const rhX = cx + localHX * Math.cos(rotRad) - localHY * Math.sin(rotRad);
                    const rhY = cy + localHX * Math.sin(rotRad) + localHY * Math.cos(rotRad);
                    if (Math.sqrt((x - rhX) ** 2 + (y - rhY) ** 2) <= 14) {
                        drawCanvas.style.cursor = 'crosshair'; return;
                    }
                    const handle = VC.ShapeRenderer.hitTestResizeHandle(x, y, selectedObj);
                    if (handle) {
                        const cursors = { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize', n: 'n-resize', s: 's-resize', w: 'w-resize', e: 'e-resize' };
                        drawCanvas.style.cursor = cursors[handle] || 'pointer'; return;
                    }
                }
            }
            let hit = false;
            for (let i = objects.length - 1; i >= 0; i--) {
                const o = objects[i];
                const oPos = o.x !== undefined ? { x: o.x * csize.w, y: o.y * csize.h } :
                    (() => { const p = POSITIONS[o.position] || POSITIONS.center; return { x: csize.w * p[0], y: csize.h * p[1] }; })();
                const sz = VC.ShapeRenderer.resolveSize(o.size);
                const dx = x - oPos.x, dy = y - oPos.y;
                if (Math.sqrt(dx * dx + dy * dy) <= sz * 1.2) { hit = true; break; }
            }
            if (currentDrawTool === 'fill') {
                drawCanvas.style.cursor = hit ? 'crosshair' : 'default';
            } else {
                drawCanvas.style.cursor = hit ? 'grab' : (currentDrawTool === 'shape' ? 'crosshair' : '');
            }
            return;
        }

        if (!isDrawing) return;
        let sx1 = lastX, sy1 = lastY, sx2 = x, sy2 = y;
        if (VC.Viewport) {
            const sp1 = VC.Viewport.canvasToScreen(lastX, lastY);
            const sp2 = VC.Viewport.canvasToScreen(x, y);
            sx1 = sp1.x; sy1 = sp1.y; sx2 = sp2.x; sy2 = sp2.y;
        }
        const scaledBrushSize = VC.Viewport ? brushSize * VC.Viewport.getScale() : brushSize;
        const eraserSize = scaledBrushSize * 3;

        if (currentDrawTool === 'eraser') {
            drawCtx.globalCompositeOperation = 'source-over';
            drawCtx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
            drawCtx.lineWidth = eraserSize; drawCtx.lineCap = 'round';
            drawCtx.beginPath(); drawCtx.moveTo(sx1, sy1); drawCtx.lineTo(sx2, sy2); drawCtx.stroke();
            const mCtx = mainCanvas.getContext('2d');
            mCtx.save(); mCtx.setTransform(1, 0, 0, 1, 0, 0);
            const dpr = window.devicePixelRatio || 1; mCtx.scale(dpr, dpr);
            mCtx.globalCompositeOperation = 'destination-out';
            mCtx.strokeStyle = 'rgba(0,0,0,1)'; mCtx.lineWidth = eraserSize; mCtx.lineCap = 'round';
            mCtx.beginPath(); mCtx.moveTo(sx1, sy1); mCtx.lineTo(sx2, sy2); mCtx.stroke();
            mCtx.restore();
        } else {
            drawCtx.globalCompositeOperation = 'source-over';
            drawCtx.strokeStyle = currentBrushColor;
            drawCtx.lineWidth = scaledBrushSize; drawCtx.lineCap = 'round';
            drawCtx.beginPath(); drawCtx.moveTo(sx1, sy1); drawCtx.lineTo(sx2, sy2); drawCtx.stroke();
        }
        [lastX, lastY] = [x, y];
    }

    function onMouseUp() {
        if (isRotating) { isRotating = false; return; }
        if (isResizing) { isResizing = false; resizeHandle = null; return; }
        if (isDragging) { isDragging = false; dragTarget = null; return; }
        if (isDrawing) {
            isDrawing = false;
            if (currentDrawTool === 'eraser') drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
    }

    function onMouseLeave() {
        if (isDrawing && currentDrawTool === 'eraser') drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        isDrawing = false; isDragging = false; isResizing = false; isRotating = false; dragTarget = null; resizeHandle = null;
    }

    /* ========== 右键菜单 ========== */
    function onContextMenu(e) {
        e.preventDefault();
        const pos = screenToCanvas(e.offsetX, e.offsetY);
        const csize = getCanvasSize();
        const POSITIONS = VC.ShapeRenderer.POSITIONS;
        ctxTarget = null;
        for (let i = objects.length - 1; i >= 0; i--) {
            const o = objects[i];
            const oPos = o.x !== undefined ? { x: o.x * csize.w, y: o.y * csize.h } :
                (() => { const p = POSITIONS[o.position] || POSITIONS.center; return { x: csize.w * p[0], y: csize.h * p[1] }; })();
            const sz = VC.ShapeRenderer.resolveSize(o.size);
            const dx = pos.x - oPos.x, dy = pos.y - oPos.y;
            if (Math.sqrt(dx * dx + dy * dy) <= sz * 1.2) { ctxTarget = o; break; }
        }
        if (!ctxTarget) { closeCtxMenu(); return; }
        const menu = document.getElementById('ctxMenu');
        document.getElementById('ctxMenuTitle').innerHTML = `<i class="fas fa-shapes"></i> ${ctxTarget.tag || ctxTarget.shape}`;
        const palette = document.getElementById('ctxColorPalette');
        const colors = COLORS;
        palette.innerHTML = colors.map(c => `<div class="ctx-color-dot${ctxTarget.color === c ? ' active' : ''}" style="background:${c};" onclick="VC.CanvasInteraction.ctxMenuSetColor('${c}')"></div>`).join('');
        const slider = document.getElementById('ctxSizeSlider');
        if (slider) slider.value = VC.ShapeRenderer.resolveSize(ctxTarget.size);
        let mx = e.clientX, my = e.clientY;
        menu.classList.add('visible');
        const rect = menu.getBoundingClientRect();
        if (mx + rect.width > window.innerWidth) mx = window.innerWidth - rect.width - 8;
        if (my + rect.height > window.innerHeight) my = window.innerHeight - rect.height - 8;
        menu.style.left = mx + 'px'; menu.style.top = my + 'px';
        selectedObjId = ctxTarget.id;
        if (VC.State) VC.State.selectedObjectId = ctxTarget.id;
        redrawAll();
    }

    function closeCtxMenu() {
        const el = document.getElementById('ctxMenu');
        if (el) el.classList.remove('visible');
        ctxTarget = null;
    }

    function ctxMenuSetColor(c) {
        if (!ctxTarget) return; ctxTarget.color = c; ctxTarget.fill = c; redrawAll(); closeCtxMenu();
    }
    function ctxMenuDelete() {
        if (!ctxTarget) return;
        const idx = objects.indexOf(ctxTarget);
        if (idx >= 0) {
            objects.splice(idx, 1);
            if (selectedObjId === ctxTarget.id) { selectedObjId = null; if (VC.State) VC.State.selectedObjectId = null; }
            redrawAll();
            if (VC.Chat) VC.Chat.addChat('assistant', `已删除${ctxTarget.tag || ctxTarget.shape}。`);
            if (VC.Voice) VC.Voice.speak(`已删除${ctxTarget.tag || ctxTarget.shape}`);
        }
        closeCtxMenu();
    }
    function ctxMenuDuplicate() {
        if (!ctxTarget) return;
        const dup = { ...ctxTarget, id: 'obj_' + Date.now() + '_' + Math.random(), x: (ctxTarget.x || 0.5) + 0.05, y: (ctxTarget.y || 0.5) + 0.05 };
        objects.push(dup); redrawAll(); closeCtxMenu();
    }
    function ctxMenuRemoveStroke() {
        if (!ctxTarget) return; ctxTarget.strokeColor = 'none'; ctxTarget.stroke = 'none'; redrawAll(); closeCtxMenu();
    }
    function ctxMenuAddStroke() {
        if (!ctxTarget) return; ctxTarget.strokeColor = '#333333'; ctxTarget.stroke = '#333333'; redrawAll(); closeCtxMenu();
    }
    function ctxMenuChangeColor() { /* 颜色盘已在菜单中显示 */ }
    function ctxMenuResize(px) {
        if (!ctxTarget) return; ctxTarget.size = px; selectedObjId = ctxTarget.id;
        if (VC.State) VC.State.selectedObjectId = ctxTarget.id;
        redrawAll();
    }

    /* ========== 图层列表 ========== */
    function updateLayerList() {
        const el = document.getElementById('objectList');
        if (!el) return;
        if (!objects.length) {
            el.innerHTML = '<div class="text-center text-[10px] py-6" style="opacity:0.3;">暂无图层</div>';
            return;
        }
        el.innerHTML = objects.map((o, i) =>
            `<div class="layer-item" onclick="VC.CanvasInteraction.selectLayer(${i})"><div class="layer-thumb" style="background:${o.fill};"></div><span class="text-[10px]">${o.shape} #${i + 1}</span><div class="layer-actions"><span class="layer-action-btn" onclick="event.stopPropagation();VC.CanvasInteraction.removeLayer(${i})"><i class="fas fa-times"></i></span></div></div>`
        ).join('');
    }
    function selectLayer(i) {
        document.querySelectorAll('.layer-item').forEach((el, j) => el.classList.toggle('active', j === i));
    }
    function removeLayer(i) {
        objects.splice(i, 1); redrawAll();
    }

    /* ========== 初始化 ========== */
    function init() {
        mainCanvas = document.getElementById('mainCanvas');
        mainCtx = mainCanvas.getContext('2d');
        drawCanvas = document.getElementById('drawCanvas');
        drawCtx = drawCanvas.getContext('2d');

        window.addEventListener('resize', resizeCanvases);
        setTimeout(resizeCanvases, 100);

        setTimeout(() => {
            if (typeof VC !== 'undefined' && VC.Viewport) {
                VC.Viewport.init(mainCanvas);
                console.log('[Init] Viewport 已初始化');
            }
        }, 150);

        drawCanvas.addEventListener('mousedown', onMouseDown);
        drawCanvas.addEventListener('mousemove', onMouseMove);
        drawCanvas.addEventListener('mouseup', onMouseUp);
        drawCanvas.addEventListener('mouseleave', onMouseLeave);
        drawCanvas.addEventListener('contextmenu', onContextMenu);

        document.addEventListener('click', e => { if (!e.target.closest('.ctx-menu')) closeCtxMenu(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtxMenu(); });

        // 同步 VC.State
        setTimeout(syncVCObjects, 200);
        setTimeout(() => {
            if (typeof VC !== 'undefined' && VC.State) {
                VC.State.on('objectsChange', () => { if (typeof redrawAll === 'function') redrawAll(); });
                console.log('[Canvas] 已注册 objectsChange → redrawAll 监听器');
            }
        }, 300);

        console.log('[CanvasInteraction] 画布交互模块初始化完成');
    }

    // ── 公开 API ──
    VC.CanvasInteraction = {
        init, redrawAll, addShape, syncVCObjects, resizeCanvases,
        closeCtxMenu, ctxMenuSetColor, ctxMenuDelete, ctxMenuDuplicate,
        ctxMenuRemoveStroke, ctxMenuAddStroke, ctxMenuChangeColor, ctxMenuResize,
        updateLayerList, selectLayer, removeLayer,
        get objects() { return objects; },
        set objects(v) { objects = v; },
        get selectedObjId() { return selectedObjId; },
        set selectedObjId(v) { selectedObjId = v; },
        get currentDrawTool() { return currentDrawTool; },
        set currentDrawTool(v) { currentDrawTool = v; },
        get currentShape() { return currentShape; },
        set currentShape(v) { currentShape = v; },
        get currentFill() { return currentFill; },
        set currentFill(v) { currentFill = v; },
        get currentStroke() { return currentStroke; },
        set currentStroke(v) { currentStroke = v; },
        get currentBrushColor() { return currentBrushColor; },
        set currentBrushColor(v) { currentBrushColor = v; },
        get currentSize() { return currentSize; },
        set currentSize(v) { currentSize = v; },
        get currentOpacity() { return currentOpacity; },
        set currentOpacity(v) { currentOpacity = v; },
        get currentPosition() { return currentPosition; },
        set currentPosition(v) { currentPosition = v; },
        get brushSize() { return brushSize; },
        set brushSize(v) { brushSize = v; },
    };

    // 全局兼容
    window.objects = objects;
    window.redrawAll = redrawAll;
    window.addShape = addShape;
    window.syncVCObjects = syncVCObjects;
    window.closeCtxMenu = closeCtxMenu;
    window.ctxMenuSetColor = ctxMenuSetColor;
    window.ctxMenuDelete = ctxMenuDelete;
    window.ctxMenuDuplicate = ctxMenuDuplicate;
    window.ctxMenuRemoveStroke = ctxMenuRemoveStroke;
    window.ctxMenuAddStroke = ctxMenuAddStroke;
    window.ctxMenuChangeColor = ctxMenuChangeColor;
    window.ctxMenuResize = ctxMenuResize;

    console.log('[CanvasInteraction] 画布交互模块加载完成');
})();
