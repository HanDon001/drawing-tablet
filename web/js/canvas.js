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
                resizeTimer = setTimeout(() => this.resize(), 100);
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

            // 清空画布
            ctx.clearRect(0, 0, width, height);

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
        },

        /**
         * 渲染单个对象
         */
        _renderObject(obj, isSelected) {
            const pos = VC.Config.POSITION_MAP[obj.position] || { x: 0.5, y: 0.5 };
            const cx = width * pos.x;
            const cy = height * pos.y;

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
            const h = sz * 1.6;
            if (obj.color !== 'none') ctx.fillRect(cx - sz, cy - sz * 0.8, w, h);
            if (obj.strokeColor !== 'none') ctx.strokeRect(cx - sz, cy - sz * 0.8, w, h);
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
