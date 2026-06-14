/**
 * VCTools — Figma 级工具系统
 * 提供：工具切换、拖拽绘制、属性面板、图层管理、编组、快捷键
 */
(function () {
    'use strict';

    let fabricCanvas = null;
    let currentTool = 'select';
    let currentFill = '#EF4444';
    let currentStroke = '#333333';
    let _drawingShape = null;
    let _isDrawing = false;
    let _startPoint = null;

    // ── VCLayer: Z轴操作 API ──────────────────────────────────

    const VCLayer = {
        /**
         * 上移一层 (Bring Forward)
         */
        bringForward(obj) {
            if (!obj || obj.type === 'activeSelection') return;
            fabricCanvas.bringForward(obj);
            fabricCanvas.renderAll();
            updateLayersList();
        },

        /**
         * 下移一层 (Send Backward)
         */
        sendBackward(obj) {
            if (!obj || obj.type === 'activeSelection') return;
            fabricCanvas.sendBackwards(obj);
            fabricCanvas.renderAll();
            updateLayersList();
        },

        /**
         * 置顶 (Bring to Front)
         */
        bringToFront(obj) {
            if (!obj || obj.type === 'activeSelection') return;
            fabricCanvas.bringToFront(obj);
            fabricCanvas.renderAll();
            updateLayersList();
        },

        /**
         * 置底 (Send to Back)
         */
        sendToBack(obj) {
            if (!obj || obj.type === 'activeSelection') return;
            fabricCanvas.sendToBack(obj);
            fabricCanvas.renderAll();
            updateLayersList();
        },

        /**
         * 组内上移一层
         */
        bringForwardInGroup(group, obj) {
            if (!group || !obj || group.type !== 'group') return;
            const children = group._objects || group.getObjects();
            const idx = children.indexOf(obj);
            if (idx >= 0 && idx < children.length - 1) {
                // 直接操作内部数组
                children.splice(idx, 1);
                children.splice(idx + 1, 0, obj);
                group.setCoords();
                group.dirty = true;
                fabricCanvas.renderAll();
                updateLayersList();
            }
        },

        /**
         * 组内下移一层
         */
        sendBackwardInGroup(group, obj) {
            if (!group || !obj || group.type !== 'group') return;
            const children = group._objects || group.getObjects();
            const idx = children.indexOf(obj);
            if (idx > 0) {
                // 直接操作内部数组
                children.splice(idx, 1);
                children.splice(idx - 1, 0, obj);
                group.setCoords();
                group.dirty = true;
                fabricCanvas.renderAll();
                updateLayersList();
            }
        }
    };

    // 暴露到全局
    window.VCLayer = VCLayer;

    // ── 初始化 ──────────────────────────────────────────

    function init() {
        const container = document.getElementById('canvasContainer');
        if (!container) {
            console.error('[FigmaTools] 找不到 canvasContainer');
            return;
        }

        // 使用容器实际像素尺寸
        const w = container.clientWidth || 800;
        const h = container.clientHeight || 600;

        const canvasEl = document.createElement('canvas');
        canvasEl.id = 'fabricCanvas';
        container.insertBefore(canvasEl, container.firstChild);

        fabricCanvas = new fabric.Canvas('fabricCanvas', {
            width: w,
            height: h,
            enableRetinaScaling: false,
            backgroundColor: '#ffffff',
            selection: true,
            selectionColor: 'rgba(76, 132, 255, 0.1)',
            selectionBorderColor: '#4C84FF',
            selectionLineWidth: 1.5,
            preserveObjectStacking: true,
        });

        // Figma 风格全局样式
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
        fabricCanvas.on('selection:created', updatePropsPanel);
        fabricCanvas.on('selection:updated', updatePropsPanel);
        fabricCanvas.on('selection:cleared', clearPropsPanel);
        fabricCanvas.on('object:modified', updatePropsPanel);
        fabricCanvas.on('object:added', updateLayersList);
        fabricCanvas.on('object:removed', updateLayersList);
        fabricCanvas.on('object:moving', updateCoordsDisplay);
        fabricCanvas.on('object:scaling', updateCoordsDisplay);
        fabricCanvas.on('object:rotating', updateCoordsDisplay);

        // 鼠标滚轮缩放
        fabricCanvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            let zoom = fabricCanvas.getZoom();
            zoom *= 0.999 ** delta;
            zoom = Math.max(0.1, Math.min(10, zoom));
            fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
            opt.e.preventDefault();
            opt.e.stopPropagation();
            updateZoomDisplay();
        });

        // 右键菜单 - 使用 contextmenu 事件
        fabricCanvas.upperCanvasEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 获取鼠标位置
            const rect = fabricCanvas.upperCanvasEl.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // 查找目标对象
            const target = fabricCanvas.findTarget(e);

            if (target) {
                // 点击到对象 → 显示对象菜单
                fabricCanvas.setActiveObject(target);
                fabricCanvas.renderAll();
                closeCanvasContextMenu();
                showContextMenu(e, target);
            } else {
                // 点击空白区域 → 显示画布菜单
                closeContextMenu();
                showCanvasContextMenu(e);
            }
        });

        // ── 空格拖拽平移画布 ──
        let spacePressed = false;
        let isPanning = false;
        let panStartX = 0, panStartY = 0;
        let panOffsetStartX = 0, panOffsetStartY = 0;

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                spacePressed = true;
                fabricCanvas.defaultCursor = 'grab';
                fabricCanvas.selection = false;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                spacePressed = false;
                isPanning = false;
                fabricCanvas.defaultCursor = currentTool === 'select' ? 'default' : 'crosshair';
                fabricCanvas.selection = (currentTool === 'select');
            }
        });

        fabricCanvas.on('mouse:down', (opt) => {
            if (spacePressed && opt.button === 1) {
                isPanning = true;
                panStartX = opt.e.clientX;
                panStartY = opt.e.clientY;
                const vpt = fabricCanvas.viewportTransform;
                panOffsetStartX = vpt[4];
                panOffsetStartY = vpt[5];
                fabricCanvas.defaultCursor = 'grabbing';
                fabricCanvas.selection = false;
            }
        });

        fabricCanvas.on('mouse:move', (opt) => {
            if (isPanning) {
                const dx = opt.e.clientX - panStartX;
                const dy = opt.e.clientY - panStartY;
                fabricCanvas.viewportTransform[4] = panOffsetStartX + dx;
                fabricCanvas.viewportTransform[5] = panOffsetStartY + dy;
                fabricCanvas.requestRenderAll();
            }
        });

        fabricCanvas.on('mouse:up', () => {
            if (isPanning) {
                isPanning = false;
                fabricCanvas.defaultCursor = spacePressed ? 'grab' : (currentTool === 'select' ? 'default' : 'crosshair');
            }
        });

        // 窗口大小变化时同步 canvas 尺寸
        window.addEventListener('resize', () => {
            const w = container.clientWidth || 800;
            const h = container.clientHeight || 600;
            fabricCanvas.setDimensions({ width: w, height: h });
            fabricCanvas.renderAll();
        });

        // 初始化色板
        initFillSwatches();

        // 键盘快捷键
        document.addEventListener('keydown', handleKeyDown);

        console.log('[FigmaTools] 初始化完成');
    }

    // ── 工具切换 ──────────────────────────────────────────

    function setTool(toolName) {
        currentTool = toolName;
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = (toolName === 'select');
        fabricCanvas.defaultCursor = toolName === 'select' ? 'default' : 'crosshair';
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();

        // 移除旧监听
        fabricCanvas.off('mouse:down', onDrawStart);
        fabricCanvas.off('mouse:move', onDrawMove);
        fabricCanvas.off('mouse:up', onDrawEnd);
        fabricCanvas.off('mouse:down', onTextClick);

        if (toolName === 'pen') {
            fabricCanvas.isDrawingMode = true;
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.width = parseInt(document.getElementById('brushSizeSlider').value);
            fabricCanvas.freeDrawingBrush.color = currentStroke;
            fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
            fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
        } else if (['rect', 'ellipse', 'line'].includes(toolName)) {
            fabricCanvas.on('mouse:down', onDrawStart);
            fabricCanvas.on('mouse:move', onDrawMove);
            fabricCanvas.on('mouse:up', onDrawEnd);
        } else if (toolName === 'text') {
            fabricCanvas.on('mouse:down', onTextClick);
        }

        // 更新按钮高亮
        document.querySelectorAll('[data-tool]').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-tool="${toolName}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    function onDrawStart(opt) {
        if (opt.target) return; // 点击了已有对象
        _isDrawing = true;
        _startPoint = fabricCanvas.getPointer(opt.e);
        const props = {
            left: _startPoint.x, top: _startPoint.y,
            fill: currentFill, stroke: currentStroke,
            strokeWidth: 2, selectable: false,
            originX: 'left', originY: 'top'
        };

        if (currentTool === 'rect') {
            _drawingShape = new fabric.Rect({ ...props, rx: 4, ry: 4 });
        } else if (currentTool === 'ellipse') {
            _drawingShape = new fabric.Ellipse({ ...props, rx: 0, ry: 0 });
        } else if (currentTool === 'line') {
            _drawingShape = new fabric.Line([_startPoint.x, _startPoint.y, _startPoint.x, _startPoint.y], { ...props, fill: null });
        }

        if (_drawingShape) fabricCanvas.add(_drawingShape);
    }

    function onDrawMove(opt) {
        if (!_isDrawing || !_drawingShape) return;
        const pointer = fabricCanvas.getPointer(opt.e);
        if (currentTool === 'line') {
            _drawingShape.set({ x2: pointer.x, y2: pointer.y });
        } else {
            const width = pointer.x - _startPoint.x;
            const height = pointer.y - _startPoint.y;
            const absW = Math.abs(width);
            const absH = Math.abs(height);
            const left = width < 0 ? pointer.x : _startPoint.x;
            const top = height < 0 ? pointer.y : _startPoint.y;

            if (currentTool === 'ellipse') {
                // Ellipse 用 rx/ry 半径，不是 width/height
                _drawingShape.set({
                    rx: absW / 2,
                    ry: absH / 2,
                    left: left + absW / 2,
                    top: top + absH / 2,
                });
            } else {
                // Rect 用 width/height
                _drawingShape.set({
                    width: absW, height: absH,
                    left: left, top: top,
                    rx: Math.min(12, absW / 4),
                    ry: Math.min(12, absH / 4)
                });
            }
        }
        fabricCanvas.renderAll();
    }

    function onDrawEnd() {
        _isDrawing = false;
        if (_drawingShape) {
            _drawingShape.set({ selectable: true });
            _drawingShape.setCoords();
            fabricCanvas.setActiveObject(_drawingShape);
        }
        _drawingShape = null;
        setTool('select');
    }

    function onTextClick(opt) {
        if (opt.target) return;
        const pointer = fabricCanvas.getPointer(opt.e);
        const text = new fabric.IText('文本', {
            left: pointer.x, top: pointer.y,
            fontSize: 20, fill: currentFill,
            fontFamily: 'Noto Sans SC, sans-serif'
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        setTool('select');
    }

    // ── 属性面板 ──────────────────────────────────────────

    function updatePropsPanel() {
        const obj = fabricCanvas.getActiveObject();
        if (!obj) { clearPropsPanel(); return; }

        document.getElementById('noSelectionProps').style.display = 'none';
        document.getElementById('activeSelectionProps').style.display = 'block';

        document.getElementById('propX').value = Math.round(obj.left);
        document.getElementById('propY').value = Math.round(obj.top);
        document.getElementById('propW').value = Math.round(obj.getScaledWidth());
        document.getElementById('propH').value = Math.round(obj.getScaledHeight());
        document.getElementById('propAngle').value = Math.round(obj.angle);
        const opacity = obj.opacity !== undefined ? obj.opacity : 1;
        document.getElementById('propOpacity').value = opacity;
        const slider = document.getElementById('propOpacitySlider');
        if (slider) slider.value = Math.round(opacity * 100);
        document.getElementById('propFill').value = obj.fill || '#ffffff';
        document.getElementById('propStroke').value = obj.stroke || '#000000';
        document.getElementById('propRx').value = obj.rx || 0;

        updateCoordsDisplay();
        updateLayersList();
    }

    function clearPropsPanel() {
        document.getElementById('noSelectionProps').style.display = 'block';
        document.getElementById('activeSelectionProps').style.display = 'none';
        document.getElementById('coordDisplay').textContent = 'X:0 Y:0';
        updateLayersList();
    }

    function updateCoordsDisplay() {
        const obj = fabricCanvas.getActiveObject();
        const coordEl = document.getElementById('coordDisplay');
        if (coordEl && obj) {
            coordEl.textContent = `X:${Math.round(obj.left)} Y:${Math.round(obj.top)} (${Math.round(obj.getScaledWidth())}x${Math.round(obj.getScaledHeight())})`;
        }
    }

    function updateProp(prop, value) {
        const obj = fabricCanvas.getActiveObject();
        if (!obj) return;
        obj.set(prop, isNaN(value) ? value : parseFloat(value));
        obj.setCoords();
        fabricCanvas.renderAll();
    }

    function updateScaledWidth(val) {
        const obj = fabricCanvas.getActiveObject();
        if (!obj) return;
        obj.set('scaleX', parseFloat(val) / obj.width);
        obj.setCoords();
        fabricCanvas.renderAll();
    }

    function updateScaledHeight(val) {
        const obj = fabricCanvas.getActiveObject();
        if (!obj) return;
        obj.set('scaleY', parseFloat(val) / obj.height);
        obj.setCoords();
        fabricCanvas.renderAll();
    }

    function updateShadow(size) {
        const obj = fabricCanvas.getActiveObject();
        if (!obj) return;
        const shadows = {
            'none': null,
            'sm': new fabric.Shadow({ blur: 5, offsetX: 2, offsetY: 2, color: 'rgba(0,0,0,0.2)' }),
            'md': new fabric.Shadow({ blur: 10, offsetX: 4, offsetY: 4, color: 'rgba(0,0,0,0.2)' }),
            'lg': new fabric.Shadow({ blur: 20, offsetX: 8, offsetY: 8, color: 'rgba(0,0,0,0.25)' })
        };
        obj.set('shadow', shadows[size]);
        fabricCanvas.renderAll();
    }

    // ── 图层列表 ──────────────────────────────────────────

    // 展开/折叠状态
    const expandedGroups = new Set();

    // ── 图层面板：支持树形嵌套 ──────────────────────────────────

    function updateLayersList() {
        const listEl = document.getElementById('objectList');
        if (!listEl) return;

        const rootObjects = fabricCanvas.getObjects();
        const countEl = document.getElementById('objCountSide');
        if (countEl) countEl.textContent = rootObjects.length;

        const hint = document.getElementById('emptyHint');
        if (hint) hint.style.display = rootObjects.length === 0 ? '' : 'none';

        if (rootObjects.length === 0) {
            listEl.innerHTML = '<div class="text-center text-[10px] py-6" style="opacity:0.3;">暂无图层</div>';
            return;
        }

        listEl.innerHTML = '';

        // 关键：反转数组，让最上层的图形显示在面板顶部 (Figma 逻辑)
        const reversedObjects = rootObjects.slice().reverse();

        // 递归渲染树形结构
        reversedObjects.forEach((obj, index) => {
            const realIndex = rootObjects.length - 1 - index;
            renderLayerNode(listEl, obj, realIndex, 0);
        });
    }

    /**
     * 递归渲染单个图层节点 (含子层级缩进)
     */
    function renderLayerNode(container, obj, index, depth) {
        const activeObj = fabricCanvas.getActiveObject();
        const isSelected = (activeObj === obj) ||
            (activeObj && activeObj.type === 'activeSelection' && activeObj.getObjects && activeObj.getObjects().includes(obj));

        const isGroup = obj.type === 'group';
        const isExpanded = expandedGroups.has(obj.id);

        const div = document.createElement('div');
        div.className = `layer-item ${isSelected ? 'selected' : ''}`;
        div.style.paddingLeft = `${12 + depth * 16}px`;

        const thumbColor = obj.fill || obj.stroke || '#f0f0f0';
        const typeName = getTypeName(obj);
        const childCount = isGroup ? obj.getObjects().length : 0;

        // 图层图标
        let icon;
        if (isGroup) {
            icon = `<i class="fas ${isExpanded ? 'fa-folder-open' : 'fa-folder'}" style="color:#F59E0B;font-size:12px;"></i>`;
        } else {
            icon = `<div class="layer-thumb" style="background:${typeof thumbColor === 'string' ? thumbColor : '#ccc'};"></div>`;
        }

        // 图层名称
        const opacity = obj.opacity !== undefined ? obj.opacity : 1;
        const opacityText = opacity < 1 ? ` ${Math.round(opacity * 100)}%` : '';
        const nameHtml = isGroup
            ? `<span class="text-[10px] truncate flex-1">${typeName} (${childCount})</span>`
            : `<span class="text-[10px] truncate flex-1">${obj.tag || typeName}${opacityText}</span>`;

        // 展开/折叠按钮
        const expandBtn = isGroup
            ? `<span class="layer-expand-btn" onclick="event.stopPropagation();VCTools.toggleGroupExpand('${obj.id}')"><i class="fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size:8px;"></i></span>`
            : '';

        // 使用对象 ID 来查找对象（避免索引变化问题）
        const objId = obj.id || `obj_${Date.now()}_${Math.random()}`;
        if (!obj.id) obj.id = objId;

        // 判断是否是组内子元素（depth > 0）
        const isChild = depth > 0;

        div.innerHTML = `
            ${expandBtn}
            ${icon}
            ${nameHtml}
            <div class="layer-actions">
                ${isChild ?
                    `<span class="layer-action-btn" onclick="event.stopPropagation();VCTools.moveChildInGroup('${objId}', 'up')" title="上移"><i class="fas fa-arrow-up"></i></span>
                     <span class="layer-action-btn" onclick="event.stopPropagation();VCTools.moveChildInGroup('${objId}', 'down')" title="下移"><i class="fas fa-arrow-down"></i></span>` :
                    `<span class="layer-action-btn" onclick="event.stopPropagation();VCTools.moveLayer('${objId}', 'up')" title="上移"><i class="fas fa-arrow-up"></i></span>
                     <span class="layer-action-btn" onclick="event.stopPropagation();VCTools.moveLayer('${objId}', 'down')" title="下移"><i class="fas fa-arrow-down"></i></span>`
                }
                ${isGroup ? `<span class="layer-action-btn" onclick="event.stopPropagation();VCTools.ungroupById('${objId}')" title="解组"><i class="fas fa-object-ungroup"></i></span>` : ''}
                <span class="layer-action-btn" onclick="event.stopPropagation();VCTools.deleteById('${objId}')"><i class="fas fa-times"></i></span>
            </div>
        `;
        div.onclick = () => {
            fabricCanvas.setActiveObject(obj);
            fabricCanvas.renderAll();
            updatePropsPanel();
        };
        container.appendChild(div);

        // 如果是展开的组，递归渲染子元素
        if (isGroup && isExpanded) {
            const children = obj.getObjects().slice().reverse();
            children.forEach((child, childIndex) => {
                const childRealIndex = obj.getObjects().length - 1 - childIndex;
                renderLayerNode(container, child, childRealIndex, depth + 1);
            });
        }
    }

    function getTypeName(obj) {
        const map = {
            'rect': '矩形', 'ellipse': '椭圆', 'triangle': '三角',
            'line': '直线', 'polygon': '多边形', 'path': '路径',
            'i-text': '文字', 'text': '文字', 'textbox': '文字',
            'group': '编组', 'activeSelection': '选区',
        };
        return map[obj.type] || '对象';
    }

    function deleteByIndex(index) {
        const objects = fabricCanvas.getObjects();
        if (objects[index]) {
            fabricCanvas.remove(objects[index]);
            fabricCanvas.renderAll();
        }
    }

    function deleteById(id) {
        const obj = fabricCanvas.getObjects().find(o => o.id === id);
        if (obj) {
            fabricCanvas.remove(obj);
            fabricCanvas.renderAll();
            updateLayersList();
        }
    }

    function moveLayer(id, direction) {
        const obj = fabricCanvas.getObjects().find(o => o.id === id);
        if (!obj) return;

        if (direction === 'up') {
            VCLayer.bringForward(obj);
        } else if (direction === 'down') {
            VCLayer.sendBackward(obj);
        }
    }

    function moveChildInGroup(childId, direction) {
        // 查找包含该子对象的组
        const groups = fabricCanvas.getObjects().filter(o => o.type === 'group');
        let targetGroup = null;
        let childObj = null;

        for (const group of groups) {
            const children = group.getObjects();
            const found = children.find(c => c.id === childId);
            if (found) {
                targetGroup = group;
                childObj = found;
                break;
            }
        }

        if (!targetGroup || !childObj) return;

        if (direction === 'up') {
            VCLayer.bringForwardInGroup(targetGroup, childObj);
        } else if (direction === 'down') {
            VCLayer.sendBackwardInGroup(targetGroup, childObj);
        }
    }

    // ── 编组 ──────────────────────────────────────────

    function groupSelected() {
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj || activeObj.type !== 'activeSelection') return;
        const groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        activeObj.toGroup();
        // toGroup() 会创建新对象，需要重新获取
        const newGroup = fabricCanvas.getActiveObject();
        if (newGroup && newGroup.type === 'group') {
            newGroup.id = groupId;
        }
        fabricCanvas.renderAll();
        updateLayersList();
    }

    function ungroupSelected() {
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj || activeObj.type !== 'group') return;
        activeObj.toActiveSelection();
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        updateLayersList();
    }

    function ungroupById(groupId) {
        const obj = fabricCanvas.getObjects().find(o => o.id === groupId);
        if (!obj || obj.type !== 'group') return;
        fabricCanvas.setActiveObject(obj);
        obj.toActiveSelection();
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        expandedGroups.delete(groupId);
        updateLayersList();
    }

    function toggleGroupExpand(groupId) {
        console.log('[FigmaTools] toggleGroupExpand:', groupId, 'expanded:', expandedGroups.has(groupId));
        if (expandedGroups.has(groupId)) {
            expandedGroups.delete(groupId);
        } else {
            expandedGroups.add(groupId);
        }
        console.log('[FigmaTools] expandedGroups:', Array.from(expandedGroups));
        updateLayersList();
    }


    // ── 撤销/清空 ──────────────────────────────────────────

    let history = [];
    let historyIndex = -1;
    const MAX_HISTORY = 30;

    function saveState() {
        history = history.slice(0, historyIndex + 1);
        history.push(fabricCanvas.toJSON(['id', 'tag', '_type']));
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;
    }

    function undo() {
        if (historyIndex <= 0) return;
        historyIndex--;
        fabricCanvas.loadFromJSON(history[historyIndex], () => {
            fabricCanvas.renderAll();
            updateLayersList();
        });
    }

    function clearAll() {
        fabricCanvas.clear();
        fabricCanvas.backgroundColor = '#ffffff';
        fabricCanvas.renderAll();
        saveState();
        updateLayersList();
    }

    // 保存初始状态
    setTimeout(() => {
        if (fabricCanvas) saveState();
    }, 500);

    // 监听修改事件保存状态
    setTimeout(() => {
        if (fabricCanvas) {
            fabricCanvas.on('object:modified', saveState);
            fabricCanvas.on('path:created', saveState);
        }
    }, 500);

    // ── 色板 ──────────────────────────────────────────

    const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#333333', '#FFFFFF'];

    function initFillSwatches() {
        const el = document.getElementById('fillSwatches');
        if (!el) return;
        el.innerHTML = '';
        COLORS.forEach(c => {
            const d = document.createElement('div');
            d.className = 'swatch' + (c === currentFill ? ' active' : '');
            d.style.background = c;
            if (c === '#FFFFFF') d.style.border = '1px solid #ddd';
            d.onclick = () => {
                el.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
                d.classList.add('active');
                currentFill = c;
                // 同步到选中对象
                const obj = fabricCanvas.getActiveObject();
                if (obj) {
                    obj.set('fill', c);
                    fabricCanvas.renderAll();
                }
            };
            el.appendChild(d);
        });
    }

    function setBrushSize(v) {
        document.getElementById('brushSizeLabel').textContent = v;
        if (fabricCanvas.isDrawingMode && fabricCanvas.freeDrawingBrush) {
            fabricCanvas.freeDrawingBrush.width = parseInt(v);
        }
    }

    // ── 右键菜单 ──────────────────────────────────────────

    function showContextMenu(e, target) {
        const menu = document.getElementById('ctxMenu');
        if (!menu) return;
        document.getElementById('ctxMenuTitle').innerHTML = `<i class="fas fa-shapes"></i> ${target.tag || getTypeName(target)}`;
        const palette = document.getElementById('ctxColorPalette');
        palette.innerHTML = COLORS.map(c => `<div class="ctx-color-dot${target.fill === c ? ' active' : ''}" style="background:${c};" onclick="VCTools.setCtxColor('${c}')"></div>`).join('');
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

    function setCtxColor(c) {
        const obj = fabricCanvas.getActiveObject();
        if (obj) { obj.set('fill', c); fabricCanvas.renderAll(); }
        closeContextMenu();
    }

    function ctxMenuSetColor() { /* 颜色盘已在菜单中 */ }
    function ctxMenuDelete() { deleteSelected(); closeContextMenu(); }
    function ctxMenuDuplicate() {
        const active = fabricCanvas.getActiveObject();
        if (!active) return;
        active.clone(function (cloned) {
            cloned.set({ left: cloned.left + 20, top: cloned.top + 20 });
            fabricCanvas.add(cloned);
            fabricCanvas.setActiveObject(cloned);
            fabricCanvas.renderAll();
        });
        closeContextMenu();
    }
    function ctxMenuResize(px) {
        const obj = fabricCanvas.getActiveObject();
        if (obj) {
            const scale = px / (obj.width || 80);
            obj.set({ scaleX: scale, scaleY: scale });
            fabricCanvas.renderAll();
        }
    }

    // ── 保存功能 ──────────────────────────────────────────

    function saveAsPNG() {
        if (!fabricCanvas) return;
        const dataURL = fabricCanvas.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 2, // 2x 分辨率
        });
        const link = document.createElement('a');
        link.download = `voicecanvas_${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        closeContextMenu();
        console.log('[FigmaTools] 已保存为 PNG');
    }

    function saveAsSVG() {
        if (!fabricCanvas) return;
        const svg = fabricCanvas.toSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `voicecanvas_${Date.now()}.svg`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        closeContextMenu();
        console.log('[FigmaTools] 已保存为 SVG');
    }

    // ── 图层排序 ──────────────────────────────────────────

    function bringToFront() {
        const obj = fabricCanvas.getActiveObject();
        if (obj) {
            fabricCanvas.bringToFront(obj);
            fabricCanvas.renderAll();
            saveState();
        }
        closeContextMenu();
    }

    function sendToBack() {
        const obj = fabricCanvas.getActiveObject();
        if (obj) {
            fabricCanvas.sendToBack(obj);
            fabricCanvas.renderAll();
            saveState();
        }
        closeContextMenu();
    }

    // ── 画布空白区域右键菜单 ──────────────────────────────

    function showCanvasContextMenu(e) {
        const menu = document.getElementById('canvasCtxMenu');
        if (!menu) return;
        menu.classList.add('visible');
        let mx = e.clientX, my = e.clientY;
        const rect = menu.getBoundingClientRect();
        if (mx + rect.width > window.innerWidth) mx = window.innerWidth - rect.width - 8;
        if (my + rect.height > window.innerHeight) my = window.innerHeight - rect.height - 8;
        menu.style.left = mx + 'px';
        menu.style.top = my + 'px';
    }

    function closeCanvasContextMenu() {
        const menu = document.getElementById('canvasCtxMenu');
        if (menu) menu.classList.remove('visible');
    }

    function canvasCtxSelectAll() {
        fabricCanvas.discardActiveObject();
        const sel = new fabric.ActiveSelection(fabricCanvas.getObjects(), {
            canvas: fabricCanvas,
        });
        fabricCanvas.setActiveObject(sel);
        fabricCanvas.renderAll();
        closeCanvasContextMenu();
    }

    function canvasCtxClearAll() {
        if (confirm('确定要清空画布吗？')) {
            clearAll();
        }
        closeCanvasContextMenu();
    }

    function canvasCtxSavePNG() {
        saveAsPNG();
        closeCanvasContextMenu();
    }

    function canvasCtxSaveSVG() {
        saveAsSVG();
        closeCanvasContextMenu();
    }

    function deleteSelected() {
        const active = fabricCanvas.getActiveObjects();
        if (active.length === 0) return;
        active.forEach(obj => fabricCanvas.remove(obj));
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
    }

    // ── 缩放 ──────────────────────────────────────────

    function zoomIn() {
        let zoom = fabricCanvas.getZoom() * 1.2;
        fabricCanvas.setZoom(zoom);
        updateZoomDisplay();
    }

    function zoomOut() {
        let zoom = fabricCanvas.getZoom() / 1.2;
        fabricCanvas.setZoom(Math.max(0.1, zoom));
        updateZoomDisplay();
    }

    function resetZoom() {
        fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        updateZoomDisplay();
    }

    function updateZoomDisplay() {
        const el = document.getElementById('zoomDisplay');
        if (el) el.textContent = Math.round(fabricCanvas.getZoom() * 100) + '%';
    }

    // ── 快捷键 ──────────────────────────────────────────

    function handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        switch (e.key.toLowerCase()) {
            case 'v': setTool('select'); break;
            case 'r': setTool('rect'); break;
            case 'o': setTool('ellipse'); break;
            case 't': setTool('text'); break;
            case 'p': setTool('pen'); break;
            case 'l': setTool('line'); break;
            case 'delete': case 'backspace': deleteSelected(); break;
        }
        if (e.ctrlKey && e.key === 'g') { e.preventDefault(); groupSelected(); }
        if (e.ctrlKey && e.shiftKey && e.key === 'G') { e.preventDefault(); ungroupSelected(); }
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    }

    // ── 画布事件监听（关闭右键菜单）─────────────────────────

    document.addEventListener('click', e => {
        if (!e.target.closest('.ctx-menu')) {
            closeContextMenu();
            closeCanvasContextMenu();
        }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); });

    // ── 对象操作（供 cmd.js 调用）─────────────────────────

    function createShape(type, opts = {}) {
        const defaults = {
            left: fabricCanvas.width / 2,
            top: fabricCanvas.height / 2,
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
            case 'circle': {
                const r = o.radius || o.size || 40;
                obj = new fabric.Circle({
                    radius: r,
                    left: o.left,
                    top: o.top,
                    fill: o.fill,
                    stroke: o.stroke,
                    strokeWidth: o.strokeWidth,
                    opacity: o.opacity,
                    originX: o.originX,
                    originY: o.originY,
                    angle: o.angle || 0,
                });
                break;
            }
            case 'rect': case 'rectangle':
                obj = new fabric.Rect({ width: o.width || o.size || 80, height: o.height || (o.size || 80) * 0.7, rx: o.rx || 8, ry: o.ry || 8, ...o });
                break;
            case 'triangle':
                obj = new fabric.Triangle({ width: o.width || o.size || 80, height: o.height || o.size || 80, ...o });
                break;
            case 'line':
                obj = new fabric.Line([-(o.size || 80) / 2, 0, (o.size || 80) / 2, 0], { stroke: o.fill || '#333333', strokeWidth: o.strokeWidth || 3, fill: 'transparent', ...o });
                break;
            case 'star': {
                const points = [];
                const spikes = 5;
                const outerR = (o.size || 80) / 2;
                const innerR = outerR / 2;
                for (let i = 0; i < spikes * 2; i++) {
                    const r = i % 2 === 0 ? outerR : innerR;
                    const angle = (Math.PI / spikes) * i - Math.PI / 2;
                    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
                }
                obj = new fabric.Polygon(points, o);
                break;
            }
            case 'diamond': {
                const s = (o.size || 80) / 2;
                obj = new fabric.Polygon([{ x: 0, y: -s }, { x: s * 0.6, y: 0 }, { x: 0, y: s }, { x: -s * 0.6, y: 0 }], o);
                break;
            }
            case 'arrow': {
                const s = (o.size || 80) / 2;
                obj = new fabric.Polygon([{ x: -s, y: 0 }, { x: s * 0.3, y: 0 }, { x: s * 0.3, y: -s * 0.4 }, { x: s, y: 0 }, { x: s * 0.3, y: s * 0.4 }, { x: s * 0.3, y: 0 }], { ...o, fill: 'transparent', stroke: o.fill || '#333', strokeWidth: 3 });
                break;
            }
            case 'hexagon': {
                const r = (o.size || 80) / 2;
                const points = [];
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
                    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
                }
                obj = new fabric.Polygon(points, o);
                break;
            }
            case 'text':
                obj = new fabric.Text(o.text || '文字', { fontSize: o.fontSize || 24, fontFamily: 'Noto Sans SC, sans-serif', ...o });
                break;
            default:
                console.warn('[FigmaTools] 未知形状:', type);
                return null;
        }

        obj.id = opts.id || ('obj_' + Date.now() + '_' + Math.random());
        obj._type = type;
        obj.tag = opts.tag || null;
        fabricCanvas.add(obj);
        fabricCanvas.setActiveObject(obj);
        fabricCanvas.renderAll();
        saveState();
        return obj;
    }

    function updateObject(obj, updates) {
        if (!obj) return false;
        obj.set(updates);
        obj.setCoords();
        fabricCanvas.renderAll();
        saveState();
        return true;
    }

    function removeObject(obj) {
        if (!obj) return false;
        fabricCanvas.remove(obj);
        fabricCanvas.renderAll();
        saveState();
        return true;
    }

    function getObjects() {
        return fabricCanvas ? fabricCanvas.getObjects() : [];
    }

    /**
     * 从 JSON 加载画布（AI 生成矢量图用）
     */
    function loadFromJSON(jsonData, callback) {
        if (!fabricCanvas) return;
        fabricCanvas.loadFromJSON(jsonData, () => {
            fabricCanvas.renderAll();
            updateLayersList();
            saveState();
            if (callback) callback();
        });
    }

    // ── 公开 API ──────────────────────────────────────────

    window.VCTools = {
        init,
        get canvas() { return fabricCanvas; },
        setTool,
        createShape,
        updateObject,
        removeObject,
        getObjects,
        loadFromJSON,
        groupSelected,
        ungroupSelected,
        ungroupById,
        toggleGroupExpand,
        undo,
        clearAll,
        deleteSelected,
        deleteByIndex,
        deleteById,
        moveLayer,
        moveChildInGroup,
        setBrushSize,
        updateProp,
        updateScaledWidth,
        updateScaledHeight,
        updateShadow,
        updatePropsPanel,
        clearPropsPanel,
        updateLayersList,
        showContextMenu,
        closeContextMenu,
        setCtxColor,
        ctxMenuSetColor,
        ctxMenuDelete,
        ctxMenuDuplicate,
        ctxMenuResize,
        saveAsPNG,
        saveAsSVG,
        bringToFront,
        sendToBack,
        showCanvasContextMenu,
        closeCanvasContextMenu,
        canvasCtxSelectAll,
        canvasCtxClearAll,
        canvasCtxSavePNG,
        canvasCtxSaveSVG,
        zoomIn,
        zoomOut,
        resetZoom,
        saveState,
        get currentFill() { return currentFill; },
        set currentFill(v) { currentFill = v; },
        get currentStroke() { return currentStroke; },
        set currentStroke(v) { currentStroke = v; },
    };

    console.log('[FigmaTools] 模块加载完成');
})();
