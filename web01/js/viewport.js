/**
 * VC.Viewport - 画布视口系统
 * 缩放、平移、标尺、坐标显示、网格对齐
 */
(function() {
    'use strict';

    // ── 状态 ──
    let canvasEl = null;
    let ctx = null;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // 视口变换
    let viewScale = 1;
    let viewOffsetX = 0;
    let viewOffsetY = 0;

    // 平移拖拽
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panOffsetStartX = 0;
    let panOffsetStartY = 0;
    let spacePressed = false;

    // 鼠标位置
    let mouseScreenX = 0;
    let mouseScreenY = 0;
    let mouseCanvasX = 0;
    let mouseCanvasY = 0;

    // 网格
    let showGrid = true;
    let gridSize = 40; // 像素

    // 标尺
    let showRulers = true;
    const RULER_SIZE = 24; // 标尺宽度

    // 缩放限制
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 10;

    // ── 公共 API ──
    VC.Viewport = {
        /**
         * 初始化
         */
        init(canvasElement) {
            canvasEl = canvasElement;
            ctx = canvasEl.getContext('2d');
            dpr = window.devicePixelRatio || 1;

            this.resize();
            this._bindEvents();
            this._bindKeys();

            console.log('[Viewport] 初始化完成, 尺寸:', width, 'x', height, 'DPR:', dpr);
        },

        /**
         * 是否正在平移
         */
        isPanning() {
            return isPanning;
        },

        /**
         * 空格键是否按下
         */
        get spacePressed() {
            return spacePressed;
        },

        /**
         * 调整尺寸
         */
        resize() {
            if (!canvasEl) return;
            const rect = canvasEl.parentElement.getBoundingClientRect();
            width = rect.width;
            height = rect.height;

            canvasEl.width = width * dpr;
            canvasEl.height = height * dpr;
            canvasEl.style.width = width + 'px';
            canvasEl.style.height = height + 'px';
            ctx.scale(dpr, dpr);
        },

        // ── 坐标转换 ──

        /**
         * 屏幕坐标 → 画布坐标（考虑缩放和平移）
         */
        screenToCanvas(sx, sy) {
            return {
                x: (sx - viewOffsetX) / viewScale,
                y: (sy - viewOffsetY) / viewScale
            };
        },

        /**
         * 画布坐标 → 屏幕坐标
         */
        canvasToScreen(cx, cy) {
            return {
                x: cx * viewScale + viewOffsetX,
                y: cy * viewScale + viewOffsetY
            };
        },

        /**
         * 画布坐标 → 比例坐标 (0-1)
         */
        canvasToRatio(cx, cy) {
            const cw = this.getCanvasWidth();
            const ch = this.getCanvasHeight();
            return { x: cx / cw, y: cy / ch };
        },

        /**
         * 比例坐标 → 画布坐标
         */
        ratioToCanvas(rx, ry) {
            const cw = this.getCanvasWidth();
            const ch = this.getCanvasHeight();
            return { x: rx * cw, y: ry * ch };
        },

        /**
         * 获取画布逻辑宽度（不受缩放影响）
         */
        getCanvasWidth() {
            return width / viewScale;
        },

        /**
         * 获取画布逻辑高度
         */
        getCanvasHeight() {
            return height / viewScale;
        },

        /**
         * 获取视口状态
         */
        getState() {
            return {
                scale: viewScale,
                offsetX: viewOffsetX,
                offsetY: viewOffsetY,
                canvasWidth: this.getCanvasWidth(),
                canvasHeight: this.getCanvasHeight(),
                mouseX: mouseCanvasX,
                mouseY: mouseCanvasY,
                mouseRatioX: mouseCanvasX / this.getCanvasWidth(),
                mouseRatioY: mouseCanvasY / this.getCanvasHeight(),
                showGrid: showGrid,
                gridSize: gridSize,
                showRulers: showRulers
            };
        },

        /**
         * 设置缩放（以画布中心为中心）
         */
        setScale(newScale) {
            const centerX = width / 2;
            const centerY = height / 2;
            this._zoomAt(centerX, centerY, newScale);
        },

        /**
         * 重置视口
         */
        reset() {
            viewScale = 1;
            viewOffsetX = 0;
            viewOffsetY = 0;
            this._updateUI();
            if (typeof redrawAll === 'function') redrawAll();
        },

        /**
         * 适应画布（全部显示）
         */
        fitToCanvas() {
            const cw = this.getCanvasWidth();
            const ch = this.getCanvasHeight();
            const scaleX = width / cw;
            const scaleY = height / ch;
            viewScale = Math.min(scaleX, scaleY) * 0.9;
            viewOffsetX = (width - cw * viewScale) / 2;
            viewOffsetY = (height - ch * viewScale) / 2;
            this._updateUI();
        },

        /**
         * 切换网格
         */
        toggleGrid() {
            showGrid = !showGrid;
            this._updateUI();
            if (typeof redrawAll === 'function') redrawAll();
        },

        /**
         * 设置网格大小
         */
        setGridSize(size) {
            gridSize = size;
            this._updateUI();
        },

        /**
         * 切换标尺
         */
        toggleRulers() {
            showRulers = !showRulers;
            this._updateUI();
            if (typeof redrawAll === 'function') redrawAll();
        },

        // ── 渲染 ──

        /**
         * 开始渲染帧（应用视口变换）
         */
        beginFrame() {
            if (!ctx) return;
            ctx.save();
            ctx.clearRect(0, 0, width, height);
            ctx.translate(viewOffsetX, viewOffsetY);
            ctx.scale(viewScale, viewScale);
        },

        /**
         * 结束渲染帧（绘制标尺和UI）
         */
        endFrame() {
            ctx.restore();
            // 绘制网格、标尺、十字准线（在视口变换之外绘制，固定在屏幕上）
            if (showGrid) {
                this._drawGrid();
            }
            if (showRulers) {
                this._drawRulers();
            }
            this._drawCrosshair();
        },

        /**
         * 获取变换后的上下文
         */
        getCtx() { return ctx; },
        getDpr() { return dpr; },
        getWidth() { return width; },
        getHeight() { return height; },
        getScale() { return viewScale; },
        getOffset() { return { x: viewOffsetX, y: viewOffsetY } },

        // ── 内部方法 ──

        /**
         * 在屏幕位置(sx,sy)处缩放
         */
        _zoomAt(sx, sy, newScale) {
            newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
            // 保持(sx,sy)处的画布坐标不变
            const canvasPos = this.screenToCanvas(sx, sy);
            viewScale = newScale;
            viewOffsetX = sx - canvasPos.x * viewScale;
            viewOffsetY = sy - canvasPos.y * viewScale;
            this._updateUI();
            // 触发重绘
            if (typeof redrawAll === 'function') redrawAll();
        },

        /**
         * 绘制网格
         */
        _drawGrid() {
            if (!ctx) return;
            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 0.5;

            // 计算可见区域的画布坐标范围
            const topLeft = this.screenToCanvas(0, 0);
            const bottomRight = this.screenToCanvas(width, height);

            // 网格间距根据缩放调整
            let gs = gridSize;
            while (gs * viewScale < 15) gs *= 2;
            while (gs * viewScale > 150) gs /= 2;

            const startX = Math.floor(topLeft.x / gs) * gs;
            const startY = Math.floor(topLeft.y / gs) * gs;

            ctx.beginPath();
            for (let x = startX; x <= bottomRight.x; x += gs) {
                const sx = x * viewScale + viewOffsetX;
                if (sx < 0 || sx > width) continue;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, height);
            }
            for (let y = startY; y <= bottomRight.y; y += gs) {
                const sy = y * viewScale + viewOffsetY;
                if (sy < 0 || sy > height) continue;
                ctx.moveTo(0, sy);
                ctx.lineTo(width, sy);
            }
            ctx.stroke();
            ctx.restore();
        },

        /**
         * 绘制标尺
         */
        _drawRulers() {
            if (!ctx) return;
            ctx.save();

            // 水平标尺（顶部）
            ctx.fillStyle = '#f8f8f8';
            ctx.fillRect(0, 0, width, RULER_SIZE);
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, RULER_SIZE);
            ctx.lineTo(width, RULER_SIZE);
            ctx.stroke();

            // 垂直标尺（左侧）
            ctx.fillStyle = '#f8f8f8';
            ctx.fillRect(0, 0, RULER_SIZE, height);
            ctx.strokeStyle = '#ddd';
            ctx.beginPath();
            ctx.moveTo(RULER_SIZE, 0);
            ctx.lineTo(RULER_SIZE, height);
            ctx.stroke();

            // 标尺刻度
            ctx.fillStyle = '#888';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';

            // 计算刻度间隔
            let tickInterval = 50;
            if (viewScale < 0.3) tickInterval = 200;
            else if (viewScale < 0.6) tickInterval = 100;
            else if (viewScale > 3) tickInterval = 20;

            // 水平刻度
            const topLeft = this.screenToCanvas(RULER_SIZE, RULER_SIZE);
            const bottomRight = this.screenToCanvas(width, height);
            const startX = Math.floor(topLeft.x / tickInterval) * tickInterval;

            for (let x = startX; x <= bottomRight.x; x += tickInterval) {
                const sx = x * viewScale + viewOffsetX;
                if (sx < RULER_SIZE) continue;
                ctx.beginPath();
                ctx.moveTo(sx, RULER_SIZE - 5);
                ctx.lineTo(sx, RULER_SIZE);
                ctx.stroke();
                ctx.fillText(Math.round(x), sx, RULER_SIZE - 7);
            }

            // 垂直刻度
            ctx.textAlign = 'right';
            const startY = Math.floor(topLeft.y / tickInterval) * tickInterval;
            for (let y = startY; y <= bottomRight.y; y += tickInterval) {
                const sy = y * viewScale + viewOffsetY;
                if (sy < RULER_SIZE) continue;
                ctx.beginPath();
                ctx.moveTo(RULER_SIZE - 5, sy);
                ctx.lineTo(RULER_SIZE, sy);
                ctx.stroke();
                ctx.save();
                ctx.translate(RULER_SIZE - 7, sy);
                ctx.rotate(-Math.PI / 2);
                ctx.textAlign = 'center';
                ctx.fillText(Math.round(y), 0, 0);
                ctx.restore();
            }

            // 标尺交叉点（左上角小方块）
            ctx.fillStyle = '#e8e8e8';
            ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
            ctx.strokeStyle = '#ddd';
            ctx.strokeRect(0, 0, RULER_SIZE, RULER_SIZE);

            ctx.restore();
        },

        /**
         * 绘制十字准线
         */
        _drawCrosshair() {
            if (mouseScreenX < RULER_SIZE || mouseScreenY < RULER_SIZE) return;

            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 4]);

            // 水平线
            ctx.beginPath();
            ctx.moveTo(RULER_SIZE, mouseScreenY);
            ctx.lineTo(width, mouseScreenY);
            ctx.stroke();

            // 垂直线
            ctx.beginPath();
            ctx.moveTo(mouseScreenX, RULER_SIZE);
            ctx.lineTo(mouseScreenX, height);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.restore();
        },

        /**
         * 绑定鼠标事件
         */
        _bindEvents() {
            const container = canvasEl.parentElement;

            // 鼠标滚轮缩放
            container.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                const rect = canvasEl.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                this._zoomAt(sx, sy, viewScale * delta);
            }, { passive: false });

            // 鼠标移动（容器内）
            const onMouseMove = (e) => {
                const rect = canvasEl.getBoundingClientRect();
                mouseScreenX = e.clientX - rect.left;
                mouseScreenY = e.clientY - rect.top;

                const canvasPos = this.screenToCanvas(mouseScreenX, mouseScreenY);
                mouseCanvasX = canvasPos.x;
                mouseCanvasY = canvasPos.y;

                // 平移拖拽
                if (isPanning) {
                    viewOffsetX = panOffsetStartX + (mouseScreenX - panStartX);
                    viewOffsetY = panOffsetStartY + (mouseScreenY - panStartY);
                    if (typeof redrawAll === 'function') redrawAll();
                }

                this._updateUI();
            };
            container.addEventListener('mousemove', onMouseMove);

            // 鼠标按下（中键或空格+左键）
            container.addEventListener('mousedown', (e) => {
                if (e.button === 1 || (e.button === 0 && spacePressed)) {
                    e.preventDefault();
                    isPanning = true;
                    panStartX = mouseScreenX;
                    panStartY = mouseScreenY;
                    panOffsetStartX = viewOffsetX;
                    panOffsetStartY = viewOffsetY;
                    container.style.cursor = 'grabbing';
                    // 绑定 document 级别事件，确保鼠标移出画布仍能平移
                    document.addEventListener('mousemove', onMouseMove);
                    const onUp = () => {
                        isPanning = false;
                        container.style.cursor = '';
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onUp);
                    };
                    document.addEventListener('mouseup', onUp);
                }
            });

            // 鼠标释放（容器内非平移状态的清理）
            container.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    container.style.cursor = '';
                }
            });
        },

        /**
         * 绑定键盘事件
         */
        _bindKeys() {
            document.addEventListener('keydown', (e) => {
                if (e.code === 'Space' && !e.repeat) {
                    spacePressed = true;
                    canvasEl.parentElement.style.cursor = 'grab';
                }
                // Ctrl + 加号/减号缩放
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === '=' || e.key === '+') {
                        e.preventDefault();
                        this.setScale(viewScale * 1.2);
                    } else if (e.key === '-') {
                        e.preventDefault();
                        this.setScale(viewScale / 1.2);
                    } else if (e.key === '0') {
                        e.preventDefault();
                        this.reset();
                    }
                }
                // G 切换网格
                if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
                    const active = document.activeElement;
                    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
                    this.toggleGrid();
                }
                // R 切换标尺
                if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
                    const active = document.activeElement;
                    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
                    this.toggleRulers();
                }
            });

            document.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    spacePressed = false;
                    canvasEl.parentElement.style.cursor = '';
                }
            });
        },

        /**
         * 更新 UI 显示
         */
        _updateUI() {
            // 更新坐标显示
            const coordEl = document.getElementById('coordDisplay');
            if (coordEl) {
                const rx = (mouseCanvasX / this.getCanvasWidth()).toFixed(3);
                const ry = (mouseCanvasY / this.getCanvasHeight()).toFixed(3);
                coordEl.textContent = `X:${Math.round(mouseCanvasX)} Y:${Math.round(mouseCanvasY)} (${rx},${ry})`;
            }

            // 更新缩放显示
            const zoomEl = document.getElementById('zoomDisplay');
            if (zoomEl) {
                zoomEl.textContent = Math.round(viewScale * 100) + '%';
            }

            // 更新网格按钮状态
            const gridBtn = document.getElementById('gridToggleBtn');
            if (gridBtn) {
                gridBtn.classList.toggle('active', showGrid);
            }

            // 更新标尺按钮状态
            const rulerBtn = document.getElementById('rulerToggleBtn');
            if (rulerBtn) {
                rulerBtn.classList.toggle('active', showRulers);
            }
        }
    };

    console.log('[Viewport] 模块加载完成');
})();
