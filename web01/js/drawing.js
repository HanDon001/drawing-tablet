/**
 * VC.Drawing - 自由绘画引擎
 * 画笔、橡皮擦、填充工具
 * 使用独立 Canvas 层，与形状层分离
 */
(function() {
    'use strict';

    let drawCanvas = null;
    let drawCtx = null;
    let dpr = 1;
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // 历史记录（ImageData 快照）
    const history = [];
    const MAX_HISTORY = 20;

    VC.Drawing = {
        /**
         * 初始化绘画层
         */
        init(canvasElement) {
            drawCanvas = canvasElement;
            drawCtx = drawCanvas.getContext('2d', { willReadFrequently: true });
            dpr = window.devicePixelRatio || 1;

            this.resize();
            this._bindEvents();

            console.log('[Drawing] 绘画引擎初始化完成');
        },

        /**
         * 调整尺寸（跟随主画布）
         */
        resize() {
            if (!drawCanvas) return;

            const rect = drawCanvas.parentElement.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;

            // 保存当前内容
            let imageData = null;
            if (drawCtx && drawCanvas.width > 0 && drawCanvas.height > 0) {
                try { imageData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height); } catch {}
            }

            // 设置物理像素
            drawCanvas.width = w * dpr;
            drawCanvas.height = h * dpr;

            // 设置 CSS 尺寸
            drawCanvas.style.width = w + 'px';
            drawCanvas.style.height = h + 'px';

            // 缩放上下文
            drawCtx.scale(dpr, dpr);

            // 恢复内容
            if (imageData) {
                drawCtx.save();
                drawCtx.setTransform(1, 0, 0, 1, 0, 0);
                drawCtx.putImageData(imageData, 0, 0);
                drawCtx.restore();
            }
        },

        /**
         * 绑定鼠标/触摸事件
         */
        _bindEvents() {
            // 鼠标事件
            drawCanvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
            drawCanvas.addEventListener('mousemove', (e) => this._onPointerMove(e));
            drawCanvas.addEventListener('mouseup', () => this._onPointerUp());
            drawCanvas.addEventListener('mouseleave', () => this._onPointerUp());

            // 触摸事件
            drawCanvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                this._onPointerDown(touch);
            }, { passive: false });

            drawCanvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                this._onPointerMove(touch);
            }, { passive: false });

            drawCanvas.addEventListener('touchend', (e) => {
                e.preventDefault();
                this._onPointerUp();
            });
        },

        /**
         * 获取画布坐标（考虑 DPR、offset 和 viewport 变换）
         */
        _getPos(e) {
            const rect = drawCanvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            // 如果有 viewport，转换为画布坐标
            if (VC.Viewport) {
                const pos = VC.Viewport.screenToCanvas(sx, sy);
                return { x: pos.x, y: pos.y };
            }
            return { x: sx, y: sy };
        },

        /**
         * 指针按下
         */
        _onPointerDown(e) {
            const rect = drawCanvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const pos = this._getPos(e); // 画布坐标（考虑viewport变换）
            const tool = VC.State.currentTool;

            // 先检测是否命中形状（select和shape模式下可以拖拽）
            if (tool === 'select' || tool === 'shape') {
                if (VC.Canvas && VC.Canvas.hitTest) {
                    const hit = VC.Canvas.hitTest(pos.x, pos.y);
                    if (hit) {
                        VC.Canvas.startDrag(hit, pos.x, pos.y);
                        return;
                    }
                }
            }

            // shape模式：点击空白处创建形状
            if (tool === 'shape') {
                // 转换为比例坐标 (0-1)
                const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : (VC.Canvas ? VC.Canvas.getSize().width : 800);
                const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : (VC.Canvas ? VC.Canvas.getSize().height : 600);
                const x = pos.x / canvasW;
                const y = pos.y / canvasH;
                if (VC.Cmd) {
                    VC.Cmd.drawShape({
                        shape: VC.State.currentShape,
                        x: x,
                        y: y
                    });
                }
                return;
            }

            // select模式：点击空白处取消选中
            if (tool === 'select') {
                if (VC.State) VC.State.select(null);
                return;
            }

            if (tool !== 'pen' && tool !== 'eraser' && tool !== 'fill') return;

            if (tool === 'fill') {
                this._saveHistory();
                this.floodFill(pos.x, pos.y);
                VC.State.emit('drawingChange');
                return;
            }

            // 画笔/橡皮擦
            this._saveHistory();
            isDrawing = true;
            lastX = pos.x;
            lastY = pos.y;

            // 画一个点（点击不拖动也能出点）
            this._drawDot(pos.x, pos.y);
        },

        /**
         * 指针移动
         */
        _onPointerMove(e) {
            const pos = this._getPos(e);
            const tool = VC.State.currentTool;

            // 拖拽形状
            if (VC.Canvas && VC.Canvas.isDragging && VC.Canvas.isDragging()) {
                VC.Canvas.dragMove(pos.x, pos.y);
                drawCanvas.style.cursor = 'grabbing';
                return;
            }

            // select和shape模式：悬停检测
            if (tool === 'select' || tool === 'shape') {
                if (VC.Canvas && VC.Canvas.hitTest) {
                    const hit = VC.Canvas.hitTest(pos.x, pos.y);
                    drawCanvas.style.cursor = hit ? 'grab' : (tool === 'shape' ? 'crosshair' : '');
                }
                return;
            }

            if (!isDrawing) return;

            this.drawLine(lastX, lastY, pos.x, pos.y);
            lastX = pos.x;
            lastY = pos.y;
        },

        /**
         * 指针释放
         */
        _onPointerUp() {
            // 结束形状拖拽
            if (VC.Canvas && VC.Canvas.isDragging && VC.Canvas.isDragging()) {
                VC.Canvas.endDrag();
                return;
            }

            if (isDrawing) {
                isDrawing = false;
                VC.State.emit('drawingChange');
            }
        },

        /**
         * 画一个点
         */
        _drawDot(x, y) {
            const brush = VC.State.brush;
            const tool = VC.State.currentTool;

            // 将画布坐标转换为屏幕坐标
            let sx = x, sy = y;
            if (VC.Viewport) {
                const screenPos = VC.Viewport.canvasToScreen(x, y);
                sx = screenPos.x;
                sy = screenPos.y;
            }

            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            drawCtx.scale(dpr, dpr);

            if (tool === 'eraser') {
                drawCtx.globalCompositeOperation = 'destination-out';
                drawCtx.fillStyle = 'rgba(0,0,0,1)';
            } else {
                drawCtx.globalCompositeOperation = 'source-over';
                drawCtx.globalAlpha = brush.opacity;
                drawCtx.fillStyle = brush.color;
            }

            // 根据缩放调整画笔大小
            const scaledSize = VC.Viewport ? brush.size * VC.Viewport.getScale() : brush.size;

            drawCtx.beginPath();
            drawCtx.arc(sx, sy, scaledSize / 2, 0, Math.PI * 2);
            drawCtx.fill();

            drawCtx.restore();
        },

        /**
         * 画线段
         */
        drawLine(x1, y1, x2, y2) {
            const brush = VC.State.brush;
            const tool = VC.State.currentTool;

            // 将画布坐标转换为屏幕坐标
            let sx1 = x1, sy1 = y1, sx2 = x2, sy2 = y2;
            if (VC.Viewport) {
                const sp1 = VC.Viewport.canvasToScreen(x1, y1);
                const sp2 = VC.Viewport.canvasToScreen(x2, y2);
                sx1 = sp1.x; sy1 = sp1.y;
                sx2 = sp2.x; sy2 = sp2.y;
            }

            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            drawCtx.scale(dpr, dpr);

            if (tool === 'eraser') {
                drawCtx.globalCompositeOperation = 'destination-out';
                drawCtx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                drawCtx.globalCompositeOperation = 'source-over';
                drawCtx.globalAlpha = brush.opacity;
                drawCtx.strokeStyle = brush.color;
            }

            // 根据缩放调整画笔大小
            const scaledSize = VC.Viewport ? brush.size * VC.Viewport.getScale() : brush.size;

            drawCtx.lineWidth = scaledSize;
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';

            drawCtx.beginPath();
            drawCtx.moveTo(sx1, sy1);
            drawCtx.lineTo(sx2, sy2);
            drawCtx.stroke();

            drawCtx.restore();
        },

        /**
         * 种子填充算法（Flood Fill）
         */
        floodFill(x, y) {
            const brush = VC.State.brush;
            const px = Math.round(x * dpr);
            const py = Math.round(y * dpr);
            const w = drawCanvas.width;
            const h = drawCanvas.height;

            if (px < 0 || px >= w || py < 0 || py >= h) return;

            const imageData = drawCtx.getImageData(0, 0, w, h);
            const data = imageData.data;

            // 目标颜色（点击位置的颜色）
            const targetIdx = (py * w + px) * 4;
            const targetR = data[targetIdx];
            const targetG = data[targetIdx + 1];
            const targetB = data[targetIdx + 2];
            const targetA = data[targetIdx + 3];

            // 解析填充颜色
            const fillColor = this._parseColor(brush.color);
            const fillA = Math.round(brush.opacity * 255);

            // 如果目标颜色和填充颜色相同，不操作
            if (targetR === fillColor.r && targetG === fillColor.g &&
                targetB === fillColor.b && targetA === fillA) {
                return;
            }

            // BFS 填充
            const stack = [[px, py]];
            const visited = new Uint8Array(w * h);
            const tolerance = 30; // 颜色容差

            while (stack.length > 0) {
                const [cx, cy] = stack.pop();
                const idx = cy * w + cx;

                if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
                if (visited[idx]) continue;
                visited[idx] = 1;

                const pIdx = idx * 4;
                const dr = Math.abs(data[pIdx] - targetR);
                const dg = Math.abs(data[pIdx + 1] - targetG);
                const db = Math.abs(data[pIdx + 2] - targetB);
                const da = Math.abs(data[pIdx + 3] - targetA);

                if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) continue;

                data[pIdx] = fillColor.r;
                data[pIdx + 1] = fillColor.g;
                data[pIdx + 2] = fillColor.b;
                data[pIdx + 3] = fillA;

                stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
            }

            drawCtx.putImageData(imageData, 0, 0);
        },

        /**
         * 解析颜色字符串为 RGB
         */
        _parseColor(color) {
            // 处理 #RRGGBB 格式
            if (color.startsWith('#')) {
                const hex = color.slice(1);
                return {
                    r: parseInt(hex.substr(0, 2), 16),
                    g: parseInt(hex.substr(2, 2), 16),
                    b: parseInt(hex.substr(4, 2), 16)
                };
            }
            // 处理中文颜色名
            const colorMap = VC.Config?.COLOR_MAP || {};
            const hex = colorMap[color] || '#1F2937';
            return this._parseColor(hex);
        },

        /**
         * 保存历史快照
         */
        _saveHistory() {
            if (!drawCtx) return;
            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            const data = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
            drawCtx.restore();

            history.push(data);
            if (history.length > MAX_HISTORY) {
                history.shift();
            }
        },

        /**
         * 撤销
         */
        undo() {
            if (history.length === 0) return false;

            const data = history.pop();
            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            drawCtx.putImageData(data, 0, 0);
            drawCtx.restore();

            return true;
        },

        /**
         * 清空绘画层
         */
        clear() {
            this._saveHistory();
            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            drawCtx.restore();
        },

        /**
         * 导出绘画层为 DataURL
         */
        toDataURL() {
            return drawCanvas.toDataURL('image/png');
        },

        /**
         * 从 DataURL 加载图片到绘画层
         */
        loadFromDataURL(dataURL) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    this._saveHistory();
                    drawCtx.save();
                    drawCtx.setTransform(1, 0, 0, 1, 0, 0);
                    drawCtx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
                    drawCtx.restore();
                    resolve();
                };
                img.src = dataURL;
            });
        },

        /**
         * 加载 Image 对象到绘画层（指定位置和大小）
         */
        drawImage(img, x, y, width, height) {
            this._saveHistory();
            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            drawCtx.scale(dpr, dpr);
            drawCtx.drawImage(img, x, y, width, height);
            drawCtx.restore();
        },

        /**
         * 检查绘画层是否有内容
         */
        hasContent() {
            if (!drawCtx) return false;
            drawCtx.save();
            drawCtx.setTransform(1, 0, 0, 1, 0, 0);
            const data = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height).data;
            drawCtx.restore();

            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 0) return true;
            }
            return false;
        },

        /**
         * 设置光标样式
         */
        setCursor(tool) {
            if (!drawCanvas) return;
            switch (tool) {
                case 'pen':    drawCanvas.style.cursor = 'crosshair'; break;
                case 'eraser': drawCanvas.style.cursor = 'cell'; break;
                case 'fill':   drawCanvas.style.cursor = 'crosshair'; break;
                default:       drawCanvas.style.cursor = 'default';
            }
        }
    };

    console.log('[Drawing] 绘画引擎加载完成');
})();
