/**
 * VC.Fabric — Figma 级矢量渲染引擎
 * 基于 Fabric.js 5.x，提供：
 * - 场景图（Scene Graph）
 * - 矩阵变换（Transform Matrix）
 * - 内置变换控制器（8点缩放 + 旋转）
 * - 像素级命中测试
 * - JSON 序列化/反序列化
 * - 编组（Group）
 * - 撤销/重做
 * - 自由绘画（画笔/橡皮擦）
 */
(function () {
    'use strict';

    let canvas = null;
    let history = [];
    let historyIndex = -1;
    const MAX_HISTORY = 30;
    let ignoreHistory = false;

    // ── 初始化 ──────────────────────────────────────────

    function init() {
        const container = document.getElementById('canvasContainer');
        if (!container) {
            console.error('[Fabric] 找不到 canvasContainer');
            return;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;

        // 创建 canvas 元素
        const canvasEl = document.createElement('canvas');
        canvasEl.id = 'fabricCanvas';
        container.insertBefore(canvasEl, container.firstChild);

        // 初始化 Fabric 画布
        canvas = new fabric.Canvas('fabricCanvas', {
            width: width,
            height: height,
            backgroundColor: '#ffffff',
            selection: true,
            selectionColor: 'rgba(76, 132, 255, 0.1)',
            selectionBorderColor: '#4C84FF',
            selectionLineWidth: 1.5,
            preserveObjectStacking: true,
            controlsAboveOverlay: true,
            stopContextMenu: true,
            fireRightClick: true,
        });

        // Figma 风格全局对象样式
        fabric.Object.prototype.set({
            transparentCorners: false,
            borderColor: '#4C84FF',
            cornerColor: '#ffffff',
            cornerStrokeColor: '#4C84FF',
            cornerSize: 8,
            cornerStyle: 'circle',
            borderScaleFactor: 1.5,
            padding: 4,
        });

        // 绑定事件
        _bindEvents();

        // 保存初始状态
        _saveState();

        // 监听窗口大小变化
        window.addEventListener('resize', () => resize());

        console.log('[Fabric] 初始化完成, 尺寸:', width, 'x', height);
    }

    // ── 事件绑定 ──────────────────────────────────────────

    function _bindEvents() {
        // 选中事件
        canvas.on('selection:created', _onSelection);
        canvas.on('selection:updated', _onSelection);
        canvas.on('selection:cleared', _onSelectionCleared);

        // 修改事件
        canvas.on('object:modified', _onObjectModified);
        canvas.on('object:moving', _onObjectMoving);
        canvas.on('object:scaling', _onObjectMoving);
        canvas.on('object:rotating', _onObjectMoving);

        // 添加/移除事件
        canvas.on('object:added', _onObjectAdded);
        canvas.on('object:removed', _onObjectRemoved);

        // 鼠标滚轮缩放
        canvas.on('mouse:wheel', _onMouseWheel);

        // 右键菜单
        canvas.on('mouse:down', _onMouseDown);
    }

    function _onSelection(e) {
        const selected = e.selected || [canvas.getActiveObject()];
        _updateCoordDisplay(selected[0]);
        _updateLayerList();
        if (VC.State && selected[0]) {
            VC.State.selectedObjectId = selected[0].id;
            VC.State.emit('selectionChange', { id: selected[0].id });
        }
    }

    function _onSelectionCleared() {
        _updateLayerList();
        if (VC.State) {
            VC.State.selectedObjectId = null;
            VC.State.emit('selectionChange', { id: null });
        }
    }

    function _onObjectModified(e) {
        _saveState();
        _updateCoordDisplay(e.target);
        _emitChange('modified', e.target);
    }

    function _onObjectMoving(e) {
        _updateCoordDisplay(e.target);
    }

    function _onObjectAdded(e) {
        const hint = document.getElementById('emptyHint');
        if (hint) hint.style.display = 'none';
        _updateLayerList();
        _emitChange('add', e.target);
    }

    function _onObjectRemoved(e) {
        _updateLayerList();
        _emitChange('remove', e.target);
        // 显示空白提示
        const objects = canvas.getObjects().filter(o => !o._isGrid);
        if (objects.length === 0) {
            const hint = document.getElementById('emptyHint');
            if (hint) hint.style.display = '';
        }
    }

    function _onMouseWheel(opt) {
        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        zoom = Math.max(0.1, Math.min(10, zoom));
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
        _updateZoomDisplay();
    }

    function _onMouseDown(opt) {
        // 右键菜单
        if (opt.button === 3) {
            const target = canvas.findTarget(opt.e);
            if (target) {
                canvas.setActiveObject(target);
                canvas.renderAll();
                _showContextMenu(opt.e, target);
            }
        }
    }

    function _updateCoordDisplay(obj) {
        const coordEl = document.getElementById('coordDisplay');
        if (coordEl && obj) {
            const x = Math.round(obj.left);
            const y = Math.round(obj.top);
            const w = Math.round(obj.width * (obj.scaleX || 1));
            const h = Math.round(obj.height * (obj.scaleY || 1));
            coordEl.textContent = `X:${x} Y:${y} (${w},${h})`;
        }
    }

    function _updateZoomDisplay() {
        const zoomEl = document.getElementById('zoomDisplay');
        if (zoomEl) {
            zoomEl.textContent = Math.round(canvas.getZoom() * 100) + '%';
        }
    }

    function _emitChange(action, obj) {
        if (VC.State) {
            VC.State.emit('objectsChange', { action, object: obj });
        }
    }

    // ── 右键菜单 ──────────────────────────────────────────

    function _showContextMenu(e, target) {
        const menu = document.getElementById('ctxMenu');
        if (!menu) return;

        document.getElementById('ctxMenuTitle').innerHTML =
            `<i class="fas fa-shapes"></i> ${target.tag || target.type || '对象'}`;

        // 渲染颜色盘
        const palette = document.getElementById('ctxColorPalette');
        const colors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#333333', '#FFFFFF'];
        palette.innerHTML = colors.map(c =>
            `<div class="ctx-color-dot${target.fill === c ? ' active' : ''}" style="background:${c};" onclick="VC.Fabric.setFillColor('${c}')"></div>`
        ).join('');

        // 同步大小滑块
        const slider = document.getElementById('ctxSizeSlider');
        if (slider) slider.value = target.width * (target.scaleX || 1);

        // 定位
        menu.classList.add('visible');
        let mx = e.clientX, my = e.clientY;
        const rect = menu.getBoundingClientRect();
        if (mx + rect.width > window.innerWidth) mx = window.innerWidth - rect.width - 8;
        if (my + rect.height > window.innerHeight) my = window.innerHeight - rect.height - 8;
        menu.style.left = mx + 'px';
        menu.style.top = my + 'px';
    }

    function closeContextMenu() {
        const menu = document.getElementById('ctxMenu');
        if (menu) menu.classList.remove('visible');
    }

    // ── 历史管理（撤销/重做）────────────────────────────────

    function _saveState() {
        if (ignoreHistory) return;
        history = history.slice(0, historyIndex + 1);
        history.push(canvas.toJSON(['id', 'tag', '_type', '_vectorArt']));
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;
    }

    function undo() {
        if (historyIndex <= 0) return false;
        historyIndex--;
        ignoreHistory = true;
        canvas.loadFromJSON(history[historyIndex], () => {
            canvas.renderAll();
            ignoreHistory = false;
            _emitChange('undo', null);
            _updateLayerList();
        });
        return true;
    }

    function redo() {
        if (historyIndex >= history.length - 1) return false;
        historyIndex++;
        ignoreHistory = true;
        canvas.loadFromJSON(history[historyIndex], () => {
            canvas.renderAll();
            ignoreHistory = false;
            _emitChange('redo', null);
            _updateLayerList();
        });
        return true;
    }

    // ── 形状创建 ──────────────────────────────────────────

    function createShape(type, opts = {}) {
        const defaults = {
            left: canvas.width / 2,
            top: canvas.height / 2,
            fill: '#333333',
            stroke: 'transparent',
            strokeWidth: 2,
            opacity: 1,
            originX: 'center',
            originY: 'center',
        };
        const o = { ...defaults, ...opts };
        let obj;

        switch (type) {
            case 'circle':
                obj = new fabric.Circle({ radius: o.size || o.radius || 40, ...o });
                break;
            case 'rect':
            case 'rectangle':
                obj = new fabric.Rect({
                    width: o.width || o.size || 80,
                    height: o.height || (o.size || 80) * 0.7,
                    rx: o.rx || 8, ry: o.ry || 8,
                    ...o
                });
                break;
            case 'triangle':
                obj = new fabric.Triangle({
                    width: o.width || o.size || 80,
                    height: o.height || o.size || 80,
                    ...o
                });
                break;
            case 'line':
                obj = new fabric.Line([
                    -(o.size || 80) / 2, 0,
                    (o.size || 80) / 2, 0
                ], {
                    stroke: o.fill || '#333333',
                    strokeWidth: o.strokeWidth || 3,
                    fill: 'transparent',
                    ...o
                });
                break;
            case 'star':
                obj = _createStar(o);
                break;
            case 'diamond':
                obj = _createDiamond(o);
                break;
            case 'arrow':
                obj = _createArrow(o);
                break;
            case 'hexagon':
                obj = _createPolygon(o, 6);
                break;
            case 'text':
                obj = new fabric.Text(o.text || '文字', {
                    fontSize: o.fontSize || o.font_size || 24,
                    fontFamily: o.fontFamily || 'Noto Sans SC, sans-serif',
                    ...o
                });
                break;
            default:
                console.warn('[Fabric] 未知形状:', type);
                return null;
        }

        obj.id = opts.id || ('obj_' + Date.now() + '_' + Math.random());
        obj._type = type;
        obj.tag = opts.tag || null;
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.renderAll();
        _saveState();
        return obj;
    }

    function _createStar(o) {
        const points = [];
        const spikes = 5;
        const outerR = (o.size || 80) / 2;
        const innerR = outerR / 2;
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (Math.PI / spikes) * i - Math.PI / 2;
            points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        return new fabric.Polygon(points, o);
    }

    function _createDiamond(o) {
        const s = (o.size || 80) / 2;
        return new fabric.Polygon([
            { x: 0, y: -s },
            { x: s * 0.6, y: 0 },
            { x: 0, y: s },
            { x: -s * 0.6, y: 0 },
        ], o);
    }

    function _createArrow(o) {
        const s = (o.size || 80) / 2;
        return new fabric.Polygon([
            { x: -s, y: 0 },
            { x: s * 0.3, y: 0 },
            { x: s * 0.3, y: -s * 0.4 },
            { x: s, y: 0 },
            { x: s * 0.3, y: s * 0.4 },
            { x: s * 0.3, y: 0 },
        ], { ...o, fill: 'transparent', stroke: o.fill || '#333', strokeWidth: 3 });
    }

    function _createPolygon(o, sides) {
        const r = (o.size || 80) / 2;
        const points = [];
        for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 / sides) * i - Math.PI / 2;
            points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        return new fabric.Polygon(points, o);
    }

    // ── SVG / Path ──────────────────────────────────────────

    function createFromSVG(svgD, opts = {}) {
        const path = new fabric.Path(svgD, {
            left: opts.left || canvas.width / 2,
            top: opts.top || canvas.height / 2,
            fill: opts.fill || '#333333',
            stroke: opts.stroke || 'transparent',
            strokeWidth: opts.strokeWidth || 2,
            opacity: opts.opacity || 1,
            originX: 'center',
            originY: 'center',
            scaleX: opts.scaleX || opts.scale || 1,
            scaleY: opts.scaleY || opts.scale || 1,
            angle: opts.angle || 0,
        });
        path.id = opts.id || ('svg_' + Date.now() + '_' + Math.random());
        path._type = 'svg_path';
        path.tag = opts.tag || null;
        canvas.add(path);
        canvas.setActiveObject(path);
        canvas.renderAll();
        _saveState();
        return path;
    }

    // ── 序列化 ──────────────────────────────────────────

    function loadFromJSON(json, callback) {
        ignoreHistory = true;
        canvas.loadFromJSON(json, () => {
            canvas.renderAll();
            ignoreHistory = false;
            _saveState();
            _updateLayerList();
            if (callback) callback();
        });
    }

    function toJSON() {
        return canvas.toJSON(['id', 'tag', '_type', '_vectorArt']);
    }

    // ── 对象操作 ──────────────────────────────────────────

    function getObjectById(id) {
        return canvas.getObjects().find(o => o.id === id) || null;
    }

    function getObjectByTag(tag) {
        return canvas.getObjects().find(o => o.tag === tag) || null;
    }

    function removeObject(obj) {
        if (!obj) return false;
        canvas.remove(obj);
        canvas.renderAll();
        _saveState();
        return true;
    }

    function deleteSelected() {
        const active = canvas.getActiveObjects();
        if (active.length === 0) return false;
        active.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.renderAll();
        _saveState();
        return true;
    }

    function clearAll() {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        canvas.renderAll();
        _saveState();
    }

    function updateObject(obj, updates) {
        if (!obj) return false;
        obj.set(updates);
        obj.setCoords();
        canvas.renderAll();
        _saveState();
        return true;
    }

    function duplicateSelected() {
        const active = canvas.getActiveObject();
        if (!active) return null;
        active.clone(function (cloned) {
            cloned.set({
                left: cloned.left + 20,
                top: cloned.top + 20,
                id: 'obj_' + Date.now() + '_' + Math.random(),
            });
            canvas.add(cloned);
            canvas.setActiveObject(cloned);
            canvas.renderAll();
            _saveState();
        }, ['id', 'tag', '_type']);
        return true;
    }

    // ── 编组 ──────────────────────────────────────────

    function groupSelected() {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || activeObj.type !== 'activeSelection') return;
        const group = activeObj.toGroup();
        group.set({ id: 'group_' + Date.now(), tag: '编组', _type: 'group' });
        canvas.discardActiveObject();
        canvas.renderAll();
        _saveState();
        _updateLayerList();
    }

    function ungroupSelected() {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || activeObj.type !== 'group') return;
        activeObj.toActiveSelection();
        canvas.discardActiveObject();
        canvas.renderAll();
        _saveState();
        _updateLayerList();
    }

    // ── 颜色/属性修改 ──────────────────────────────────────

    function setFillColor(color) {
        const obj = canvas.getActiveObject();
        if (!obj) return;
        obj.set('fill', color);
        canvas.renderAll();
        _saveState();
        closeContextMenu();
    }

    function setStrokeColor(color) {
        const obj = canvas.getActiveObject();
        if (!obj) return;
        obj.set('stroke', color);
        canvas.renderAll();
        _saveState();
    }

    function resizeSelected(size) {
        const obj = canvas.getActiveObject();
        if (!obj) return;
        const scale = size / obj.width;
        obj.set({ scaleX: scale, scaleY: scale });
        canvas.renderAll();
        _saveState();
    }

    // ── 自由绘画 ──────────────────────────────────────────

    function setDrawingMode(enabled, brushColor, brushWidth) {
        canvas.isDrawingMode = enabled;
        if (enabled) {
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.color = brushColor || '#333333';
            canvas.freeDrawingBrush.width = brushWidth || 3;
            canvas.freeDrawingBrush.strokeLineCap = 'round';
            canvas.freeDrawingBrush.strokeLineJoin = 'round';
        }
    }

    function setEraserMode(enabled, eraserWidth) {
        if (enabled) {
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            canvas.freeDrawingBrush.color = '#ffffff';
            canvas.freeDrawingBrush.width = eraserWidth || 20;
        } else {
            canvas.isDrawingMode = false;
        }
    }

    // ── 视口控制 ──────────────────────────────────────────

    function setZoom(newZoom, centerX, centerY) {
        const point = new fabric.Point(
            centerX || canvas.width / 2,
            centerY || canvas.height / 2
        );
        canvas.zoomToPoint(point, Math.max(0.1, Math.min(10, newZoom)));
        _updateZoomDisplay();
    }

    function getZoom() {
        return canvas.getZoom();
    }

    function pan(dx, dy) {
        canvas.relativePan(new fabric.Point(dx, dy));
    }

    function resetViewport() {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        _updateZoomDisplay();
    }

    function fitToCanvas() {
        const objects = canvas.getObjects().filter(o => !o._isGrid);
        if (objects.length === 0) { resetViewport(); return; }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        objects.forEach(obj => {
            const bound = obj.getBoundingRect();
            minX = Math.min(minX, bound.left);
            minY = Math.min(minY, bound.top);
            maxX = Math.max(maxX, bound.left + bound.width);
            maxY = Math.max(maxY, bound.top + bound.height);
        });
        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const padding = 40;
        const zoom = Math.min(
            (canvas.width - padding * 2) / contentW,
            (canvas.height - padding * 2) / contentH,
            2
        );
        canvas.setZoom(zoom);
        const vpt = canvas.viewportTransform;
        vpt[4] = (canvas.width - contentW * zoom) / 2 - minX * zoom;
        vpt[5] = (canvas.height - contentH * zoom) / 2 - minY * zoom;
        canvas.setViewportTransform(vpt);
        _updateZoomDisplay();
    }

    // ── 网格 ──────────────────────────────────────────

    let showGrid = false;

    function toggleGrid() {
        showGrid = !showGrid;
        if (showGrid) {
            _drawGrid();
        } else {
            canvas.getObjects().filter(o => o._isGrid).forEach(o => canvas.remove(o));
            canvas.renderAll();
        }
        const btn = document.getElementById('gridToggleBtn');
        if (btn) btn.classList.toggle('active', showGrid);
    }

    function _drawGrid() {
        canvas.getObjects().filter(o => o._isGrid).forEach(o => canvas.remove(o));
        if (!showGrid) return;
        const zoom = canvas.getZoom();
        const vpt = canvas.viewportTransform;
        const gridSpacing = 50;
        const w = canvas.width / zoom;
        const h = canvas.height / zoom;
        const offsetX = -vpt[4] / zoom;
        const offsetY = -vpt[5] / zoom;
        const startX = Math.floor(offsetX / gridSpacing) * gridSpacing;
        const startY = Math.floor(offsetY / gridSpacing) * gridSpacing;

        for (let x = startX; x < offsetX + w; x += gridSpacing) {
            const line = new fabric.Line([x, offsetY, x, offsetY + h], {
                stroke: '#f0ece6', strokeWidth: 1 / zoom,
                selectable: false, evented: false, _isGrid: true,
            });
            canvas.add(line);
            canvas.sendToBack(line);
        }
        for (let y = startY; y < offsetY + h; y += gridSpacing) {
            const line = new fabric.Line([offsetX, y, offsetX + w, y], {
                stroke: '#f0ece6', strokeWidth: 1 / zoom,
                selectable: false, evented: false, _isGrid: true,
            });
            canvas.add(line);
            canvas.sendToBack(line);
        }
        canvas.renderAll();
    }

    // ── 图层列表 ──────────────────────────────────────────

    function _updateLayerList() {
        const el = document.getElementById('objectList');
        if (!el) return;
        const objects = canvas.getObjects().filter(o => !o._isGrid);
        const countEl = document.getElementById('objCountSide');
        if (countEl) countEl.textContent = objects.length;

        if (objects.length === 0) {
            el.innerHTML = '<div class="text-center text-[10px] py-6" style="opacity:0.3;">暂无图层</div>';
            return;
        }

        // 顶层在上方
        const reversed = [...objects].reverse();
        const activeObj = canvas.getActiveObject();

        el.innerHTML = reversed.map((o, i) => {
            const realIndex = objects.length - 1 - i;
            const isSelected = activeObj === o;
            const fillColor = o.fill || o.stroke || '#ccc';
            const typeName = _getTypeName(o);
            const label = o.tag || typeName;
            return `<div class="layer-item${isSelected ? ' active' : ''}" onclick="VC.Fabric.selectByIndex(${realIndex})">
                <div class="layer-thumb" style="background:${typeof fillColor === 'string' ? fillColor : '#ccc'};"></div>
                <span class="text-[10px]">${label} #${i + 1}</span>
                <div class="layer-actions">
                    <span class="layer-action-btn" onclick="event.stopPropagation();VC.Fabric.removeByIndex(${realIndex})">
                        <i class="fas fa-times"></i>
                    </span>
                </div>
            </div>`;
        }).join('');
    }

    function _getTypeName(obj) {
        const map = {
            'rect': '矩形', 'circle': '圆形', 'ellipse': '椭圆',
            'triangle': '三角', 'line': '直线', 'polygon': '多边形',
            'path': '路径', 'text': '文字', 'group': '编组',
            'activeSelection': '选区',
        };
        return map[obj.type] || obj._type || '对象';
    }

    function selectByIndex(i) {
        const objects = canvas.getObjects().filter(o => !o._isGrid);
        if (objects[i]) {
            canvas.setActiveObject(objects[i]);
            canvas.renderAll();
            _updateLayerList();
        }
    }

    function removeByIndex(i) {
        const objects = canvas.getObjects().filter(o => !o._isGrid);
        if (objects[i]) {
            removeObject(objects[i]);
        }
    }

    // ── 尺寸调整 ──────────────────────────────────────────

    function resize() {
        if (!canvas) return;
        const container = document.getElementById('canvasContainer');
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        canvas.setDimensions({ width: w, height: h });
        canvas.renderAll();
        if (showGrid) _drawGrid();
    }

    // ── 公开 API ──────────────────────────────────────────

    VC.Fabric = {
        init,
        get canvas() { return canvas; },

        // 形状创建
        createShape,
        createFromSVG,

        // 序列化
        loadFromJSON,
        toJSON,

        // 对象操作
        getObjectById,
        getObjectByTag,
        removeObject,
        deleteSelected,
        clearAll,
        updateObject,
        duplicateSelected,

        // 编组
        groupSelected,
        ungroupSelected,

        // 历史
        undo,
        redo,

        // 颜色/属性
        setFillColor,
        setStrokeColor,
        resizeSelected,
        closeContextMenu,

        // 绘画模式
        setDrawingMode,
        setEraserMode,

        // 视口
        setZoom,
        getZoom,
        pan,
        resetViewport,
        fitToCanvas,

        // 网格
        toggleGrid,

        // 图层
        selectByIndex,
        removeByIndex,
        _updateLayerList,

        // 尺寸
        resize,

        // 获取对象列表
        getObjects() {
            return canvas ? canvas.getObjects().filter(o => !o._isGrid) : [];
        },

        // 获取画布尺寸
        getWidth() { return canvas ? canvas.width : 800; },
        getHeight() { return canvas ? canvas.height : 600; },

        // 获取 Fabric 画布实例（用于 AI 生成）
        getCanvas() { return canvas; },
    };

    console.log('[Fabric] 引擎模块加载完成');
})();
