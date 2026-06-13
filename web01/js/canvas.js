/**
 * VC.Canvas - DPI 自适应 Canvas 渲染引擎
 * - Retina 屏幕清晰渲染
 * - requestAnimationFrame 循环渲染
 * - Marching ants 选中动画
 */
(function() {
    'use strict';

    let canvasEl = null;
    let ctx = null;
    let dpr = 1;
    let width = 0;
    let height = 0;
    let rafId = null;
    let marchingAntsOffset = 0;

    VC.Canvas = {
        // 拖拽状态
        _dragging: false,
        _dragObj: null,
        _dragOffsetX: 0,
        _dragOffsetY: 0,

        /**
         * 初始化 Canvas
         */
        init(canvasElement) {
            canvasEl = canvasElement;
            ctx = canvasEl.getContext('2d');
            dpr = window.devicePixelRatio || 1;

            this.resize();
            this._bindResize();
            this._startRenderLoop();

            console.log('[Canvas] 初始化完成, DPR:', dpr);
        },

        /**
         * 调整 Canvas 尺寸（DPI 自适应）
         */
        resize() {
            if (!canvasEl) return;

            const rect = canvasEl.parentElement.getBoundingClientRect();
            width = rect.width;
            height = rect.height;

            // 设置物理像素
            canvasEl.width = width * dpr;
            canvasEl.height = height * dpr;

            // 设置 CSS 尺寸
            canvasEl.style.width = width + 'px';
            canvasEl.style.height = height + 'px';

            // 缩放上下文
            ctx.scale(dpr, dpr);
        },

        /**
         * 绑定窗口 resize 事件
         */
        _bindResize() {
            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    this.resize();
                    // 同步调整绘画层尺寸
                    if (typeof VC.Drawing !== 'undefined') {
                        VC.Drawing.resize();
                    }
                }, 100);
            });
        },

        /**
         * 启动 requestAnimationFrame 渲染循环
         */
        _startRenderLoop() {
            const loop = () => {
                this._renderFrame();
                rafId = requestAnimationFrame(loop);
            };
            rafId = requestAnimationFrame(loop);
            console.log('[Canvas] 渲染循环已启动');
        },

        /**
         * 单帧渲染
         */
        _renderFrame() {
            if (!ctx) return;

            // 更新 marching ants 偏移
            marchingAntsOffset = (marchingAntsOffset + 0.5) % 16;

            // 使用 Viewport 渲染（带缩放和平移）
            if (VC.Viewport) {
                VC.Viewport.beginFrame();
            } else {
                ctx.clearRect(0, 0, width, height);
            }

            const objects = VC.State.objects;
            const selectedId = VC.State.selectedObjectId;

            // 空状态提示
            const hint = document.getElementById('emptyHint');
            if (hint) {
                hint.style.display = objects.length === 0 ? 'flex' : 'none';
            }

            // 渲染每个对象
            objects.forEach(obj => {
                this._renderObject(obj, obj.id === selectedId);
            });

            // 结束 Viewport 渲染（绘制标尺等）
            if (VC.Viewport) {
                VC.Viewport.endFrame();
            }
        },

        /**
         * 渲染单个对象
         */
        _renderObject(obj, isSelected) {
            // 使用 viewport 的画布尺寸（逻辑坐标）
            const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : width;
            const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : height;

            // 优先使用精确坐标，否则回退到位置名称
            let cx, cy;
            if (obj.x !== undefined && obj.y !== undefined) {
                cx = canvasW * obj.x;
                cy = canvasH * obj.y;
            } else {
                const pos = VC.Config.POSITION_MAP[obj.position] || { x: 0.5, y: 0.5 };
                cx = canvasW * pos.x;
                cy = canvasH * pos.y;
            }

            const base = VC.Config.CANVAS_BASE_SIZE;
            const sizeMul = obj.size === 'small' ? 1 : obj.size === 'large' ? 3 : 2;
            const sz = base * sizeMul;

            // 设置样式
            ctx.globalAlpha = obj.opacity || 1;
            ctx.fillStyle = obj.color === 'none' ? 'transparent' : obj.color;
            ctx.strokeStyle = obj.strokeColor === 'none' ? 'transparent' : obj.strokeColor;
            ctx.lineWidth = obj.strokeWidth || 2;

            // 绘制形状
            switch (obj.shape) {
                case 'circle':    this._drawCircle(cx, cy, sz, obj); break;
                case 'rectangle': this._drawRect(cx, cy, sz, obj); break;
                case 'triangle':  this._drawTriangle(cx, cy, sz, obj); break;
                case 'line':      this._drawLine(cx, cy, sz, obj); break;
                case 'star':      this._drawStar(cx, cy, sz, obj); break;
                case 'diamond':   this._drawDiamond(cx, cy, sz, obj); break;
                case 'arrow':     this._drawArrow(cx, cy, sz, obj); break;
                case 'hexagon':   this._drawHexagon(cx, cy, sz, obj); break;
            }

            // Marching ants 选中动画
            if (isSelected) {
                this._drawMarchingAnts(cx, cy, sz);
            }
        },

        /**
         * 绘制 Marching ants 虚线边框（动画效果）
         */
        _drawMarchingAnts(cx, cy, sz) {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.lineDashOffset = -marchingAntsOffset;

            // 外框
            ctx.strokeRect(cx - sz - 8, cy - sz - 8, (sz * 2) + 16, (sz * 2) + 16);

            // 内框（白色底）
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineDashOffset = -(marchingAntsOffset + 5);
            ctx.strokeRect(cx - sz - 8, cy - sz - 8, (sz * 2) + 16, (sz * 2) + 16);

            ctx.setLineDash([]);
            ctx.restore();
        },

        // ===== 形状绘制方法 =====

        _drawCircle(cx, cy, sz, obj) {
            ctx.beginPath();
            ctx.arc(cx, cy, sz, 0, Math.PI * 2);
            if (obj.color !== 'none') ctx.fill();
            if (obj.strokeColor !== 'none') ctx.stroke();
        },

        _drawRect(cx, cy, sz, obj) {
            const w = sz * 2;
            const h = sz * 1.4; // 高度是宽度的0.7倍
            const rx = cx - sz, ry = cy - h / 2;
            const radius = Math.min(w, h) * 0.1; // 圆角半径

            ctx.beginPath();
            ctx.moveTo(rx + radius, ry);
            ctx.lineTo(rx + w - radius, ry);
            ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + radius);
            ctx.lineTo(rx + w, ry + h - radius);
            ctx.quadraticCurveTo(rx + w, ry + h, rx + w - radius, ry + h);
            ctx.lineTo(rx + radius, ry + h);
            ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - radius);
            ctx.lineTo(rx, ry + radius);
            ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
            ctx.closePath();

            if (obj.color !== 'none') ctx.fill();
            if (obj.strokeColor !== 'none') ctx.stroke();
        },

        _drawTriangle(cx, cy, sz, obj) {
            ctx.beginPath();
            ctx.moveTo(cx, cy - sz);
            ctx.lineTo(cx - sz, cy + sz * 0.8);
            ctx.lineTo(cx + sz, cy + sz * 0.8);
            ctx.closePath();
            if (obj.color !== 'none') ctx.fill();
            if (obj.strokeColor !== 'none') ctx.stroke();
        },

        _drawLine(cx, cy, sz, obj) {
            ctx.beginPath();
            ctx.moveTo(cx - sz, cy);
            ctx.lineTo(cx + sz, cy);
            ctx.strokeStyle = obj.color === 'none' ? '#1F2937' : obj.color;
            ctx.lineWidth = 3;
            ctx.stroke();
        },

        _drawStar(cx, cy, sz, obj) {
            const spikes = 5;
            const outerR = sz;
            const innerR = sz / 2;
            let rot = -Math.PI / 2;
            const step = Math.PI / spikes;

            ctx.beginPath();
            for (let i = 0; i < spikes; i++) {
                ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
                rot += step;
                ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
                rot += step;
            }
            ctx.closePath();
            if (obj.color !== 'none') ctx.fill();
            if (obj.strokeColor !== 'none') ctx.stroke();
        },

        _drawDiamond(cx, cy, sz, obj) {
            ctx.beginPath();
            ctx.moveTo(cx, cy - sz);
            ctx.lineTo(cx + sz * 0.7, cy);
            ctx.lineTo(cx, cy + sz);
            ctx.lineTo(cx - sz * 0.7, cy);
            ctx.closePath();
            if (obj.color !== 'none') ctx.fill();
            if (obj.strokeColor !== 'none') ctx.stroke();
        },

        _drawArrow(cx, cy, sz, obj) {
            ctx.beginPath();
            ctx.moveTo(cx - sz, cy);
            ctx.lineTo(cx + sz, cy);
            ctx.lineTo(cx + sz - 10, cy - 10);
            ctx.moveTo(cx + sz, cy);
            ctx.lineTo(cx + sz - 10, cy + 10);
            ctx.strokeStyle = obj.color === 'none' ? '#1F2937' : obj.color;
            ctx.lineWidth = 3;
            ctx.stroke();
        },

        _drawHexagon(cx, cy, sz, obj) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const x = cx + sz * Math.cos(angle);
                const y = cy + sz * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            if (obj.color !== 'none') ctx.fill();
            if (obj.strokeColor !== 'none') ctx.stroke();
        },

        /**
         * 命中测试：检测点(px,py)是否在某个形状内
         * 返回命中的对象，或 null
         */
        hitTest(px, py) {
            const objects = VC.State.objects;
            // 从顶层往底层遍历（后添加的在上面）
            for (let i = objects.length - 1; i >= 0; i--) {
                const obj = objects[i];
                const pos = this._getObjectCenter(obj);
                const base = VC.Config.CANVAS_BASE_SIZE;
                const sizeMul = obj.size === 'small' ? 1 : obj.size === 'large' ? 3 : 2;
                const sz = base * sizeMul;

                // 简单的圆形/矩形碰撞检测
                const dx = px - pos.cx;
                const dy = py - pos.cy;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 对于大部分形状，用圆形区域检测（半径 = size * 1.2）
                if (dist <= sz * 1.2) {
                    return obj;
                }
            }
            return null;
        },

        /**
         * 获取对象的画布中心坐标（逻辑坐标，非屏幕坐标）
         */
        _getObjectCenter(obj) {
            const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : width;
            const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : height;
            let cx, cy;
            if (obj.x !== undefined && obj.y !== undefined) {
                cx = canvasW * obj.x;
                cy = canvasH * obj.y;
            } else {
                const pos = VC.Config.POSITION_MAP[obj.position] || { x: 0.5, y: 0.5 };
                cx = canvasW * pos.x;
                cy = canvasH * pos.y;
            }
            return { cx, cy };
        },

        /**
         * 开始拖拽形状
         * @param {number} mouseX - 画布坐标（非屏幕坐标）
         * @param {number} mouseY - 画布坐标
         */
        startDrag(obj, mouseX, mouseY) {
            const pos = this._getObjectCenter(obj);
            this._dragging = true;
            this._dragObj = obj;
            this._dragOffsetX = mouseX - pos.cx;
            this._dragOffsetY = mouseY - pos.cy;
            // 如果对象还没有坐标，先从当前位置初始化
            if (obj.x === undefined || obj.y === undefined) {
                const posMap = VC.Config.POSITION_MAP[obj.position] || { x: 0.5, y: 0.5 };
                obj.x = posMap.x;
                obj.y = posMap.y;
            }
            VC.State.select(obj.id);
        },

        /**
         * 拖拽移动
         * @param {number} mouseX - 画布坐标（非屏幕坐标）
         * @param {number} mouseY - 画布坐标
         */
        dragMove(mouseX, mouseY) {
            if (!this._dragging || !this._dragObj) return;
            const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : width;
            const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : height;
            const newCx = mouseX - this._dragOffsetX;
            const newCy = mouseY - this._dragOffsetY;
            const newX = Math.max(0, Math.min(1, newCx / canvasW));
            const newY = Math.max(0, Math.min(1, newCy / canvasH));

            // 直接更新对象坐标（不触发历史记录，拖拽结束后再记录）
            this._dragObj.x = newX;
            this._dragObj.y = newY;
        },

        /**
         * 结束拖拽
         */
        endDrag() {
            if (this._dragging && this._dragObj) {
                // 记录历史
                VC.State.saveHistory();
                VC.State.emit('objectsChange', { action: 'move', object: this._dragObj });
            }
            this._dragging = false;
            this._dragObj = null;
        },

        isDragging() {
            return this._dragging;
        },

        /**
         * 获取画布尺寸
         */
        getSize() {
            return { width, height };
        },

        /**
         * 停止渲染循环
         */
        stopRenderLoop() {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }
    };

    console.log('[Canvas] 渲染引擎加载完成');
})();
