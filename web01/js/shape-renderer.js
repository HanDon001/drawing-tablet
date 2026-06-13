/**
 * VC.ShapeRenderer — 形状渲染引擎
 * 从 index.html 内联 JS 拆分
 * 负责：形状绘制、控制点、命中检测、辅助函数
 */
(function () {
    'use strict';

    const SIZES = { small: 40, medium: 80, large: 140 };
    const POSITIONS = {
        left_top: [0.25, 0.25], top: [0.5, 0.25], right_top: [0.75, 0.25],
        left: [0.25, 0.5], center: [0.5, 0.5], right: [0.75, 0.5],
        left_bottom: [0.25, 0.75], bottom: [0.5, 0.75], right_bottom: [0.75, 0.75]
    };

    function resolveSize(s) {
        return typeof s === 'string' ? (SIZES[s] || 80) : (s || 80);
    }

    function drawStar(ctx, cx, cy, sp, oR, iR) {
        let rot = Math.PI / 2 * 3, step = Math.PI / sp;
        ctx.beginPath(); ctx.moveTo(cx, cy - oR);
        for (let i = 0; i < sp; i++) {
            ctx.lineTo(cx + Math.cos(rot) * oR, cy + Math.sin(rot) * oR); rot += step;
            ctx.lineTo(cx + Math.cos(rot) * iR, cy + Math.sin(rot) * iR); rot += step;
        }
        ctx.closePath();
    }

    function drawPolygon(ctx, cx, cy, r, sides) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
            if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
            else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        ctx.closePath();
    }

    function drawResizeHandles(ctx, cx, cy, size, shapeType) {
        const halfW = size / 2;
        const halfH = (shapeType === 'rectangle') ? size * 0.7 / 2 : halfW;
        const handleSize = 8;
        const handles = [
            { x: cx - halfW, y: cy - halfH, dir: 'nw' },
            { x: cx + halfW, y: cy - halfH, dir: 'ne' },
            { x: cx - halfW, y: cy + halfH, dir: 'sw' },
            { x: cx + halfW, y: cy + halfH, dir: 'se' },
            { x: cx, y: cy - halfH, dir: 'n' },
            { x: cx, y: cy + halfH, dir: 's' },
            { x: cx - halfW, y: cy, dir: 'w' },
            { x: cx + halfW, y: cy, dir: 'e' },
        ];
        ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(cx - halfW - 2, cy - halfH - 2, halfW * 2 + 4, halfH * 2 + 4);
        ctx.setLineDash([]);
        handles.forEach(h => {
            ctx.fillStyle = 'white'; ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1.5;
            ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        });
    }

    function hitTestResizeHandle(mx, my, obj) {
        if (!obj) return null;
        const selectedObjId = VC.State ? VC.State.selectedObjectId : null;
        if (obj.id !== selectedObjId) return null;
        const s = resolveSize(obj.size);
        const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : 800;
        const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : 600;
        const cx = obj.x !== undefined ? obj.x * canvasW : canvasW * (POSITIONS[obj.position] || POSITIONS.center)[0];
        const cy = obj.y !== undefined ? obj.y * canvasH : canvasH * (POSITIONS[obj.position] || POSITIONS.center)[1];
        const rot = (obj.rotation || 0) * Math.PI / 180;
        const dx = mx - cx, dy = my - cy;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        const halfW = s / 2;
        const halfH = (obj.shape === 'rectangle') ? s * 0.7 / 2 : halfW;
        const handleSize = 12;
        const handles = [
            { x: -halfW, y: -halfH, dir: 'nw' }, { x: halfW, y: -halfH, dir: 'ne' },
            { x: -halfW, y: halfH, dir: 'sw' }, { x: halfW, y: halfH, dir: 'se' },
            { x: 0, y: -halfH, dir: 'n' }, { x: 0, y: halfH, dir: 's' },
            { x: -halfW, y: 0, dir: 'w' }, { x: halfW, y: 0, dir: 'e' },
        ];
        for (const h of handles) {
            if (Math.abs(lx - h.x) <= handleSize && Math.abs(ly - h.y) <= handleSize) return h.dir;
        }
        return null;
    }

    function drawShape(ctx, obj) {
        ctx.save(); ctx.globalAlpha = obj.opacity || 1;
        const fillColor = obj.fill || obj.color;
        ctx.fillStyle = (fillColor && fillColor !== 'none') ? fillColor : 'transparent';
        const strokeColor = obj.stroke || obj.strokeColor;
        ctx.strokeStyle = (strokeColor && strokeColor !== 'none') ? strokeColor : 'transparent';
        ctx.lineWidth = obj.strokeWidth || 2;
        const s = resolveSize(obj.size);
        const canvasW = VC.Viewport ? VC.Viewport.getCanvasWidth() : 800;
        const canvasH = VC.Viewport ? VC.Viewport.getCanvasHeight() : 600;
        const x = obj.x !== undefined ? obj.x * canvasW : canvasW * (POSITIONS[obj.position] || POSITIONS.center)[0];
        const y = obj.y !== undefined ? obj.y * canvasH : canvasH * (POSITIONS[obj.position] || POSITIONS.center)[1];
        const hasFill = fillColor && fillColor !== 'none' && fillColor !== 'transparent';
        const rot = (obj.rotation || 0) * Math.PI / 180;
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot);
        const ox = 0, oy = 0;
        switch (obj.shape) {
            case 'circle': ctx.beginPath(); ctx.arc(ox, oy, s / 2, 0, Math.PI * 2); if (hasFill) ctx.fill(); ctx.stroke(); break;
            case 'rectangle': {
                const rw = s, rh = s * 0.7, rx = ox - rw / 2, ry = oy - rh / 2;
                const radius = Math.min(rw, rh) * 0.1;
                ctx.beginPath();
                ctx.moveTo(rx + radius, ry); ctx.lineTo(rx + rw - radius, ry);
                ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
                ctx.lineTo(rx + rw, ry + rh - radius);
                ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
                ctx.lineTo(rx + radius, ry + rh);
                ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
                ctx.lineTo(rx, ry + radius);
                ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
                ctx.closePath(); if (hasFill) ctx.fill(); ctx.stroke(); break;
            }
            case 'triangle': ctx.beginPath(); ctx.moveTo(ox, oy - s / 2); ctx.lineTo(ox + s / 2, oy + s / 2); ctx.lineTo(ox - s / 2, oy + s / 2); ctx.closePath(); if (hasFill) ctx.fill(); ctx.stroke(); break;
            case 'line': ctx.beginPath(); ctx.moveTo(ox - s / 2, oy); ctx.lineTo(ox + s / 2, oy); ctx.lineWidth = 3; ctx.stroke(); break;
            case 'star': drawStar(ctx, ox, oy, 5, s / 2, s / 4); if (hasFill) ctx.fill(); ctx.stroke(); break;
            case 'diamond': ctx.beginPath(); ctx.moveTo(ox, oy - s / 2); ctx.lineTo(ox + s / 3, oy); ctx.lineTo(ox, oy + s / 2); ctx.lineTo(ox - s / 3, oy); ctx.closePath(); if (hasFill) ctx.fill(); ctx.stroke(); break;
            case 'arrow': ctx.beginPath(); ctx.moveTo(ox - s / 2, oy); ctx.lineTo(ox + s / 3, oy); ctx.lineTo(ox + s / 3, oy - s / 5); ctx.lineTo(ox + s / 2, oy); ctx.lineTo(ox + s / 3, oy + s / 5); ctx.lineTo(ox + s / 3, oy); ctx.stroke(); break;
            case 'hexagon': drawPolygon(ctx, ox, oy, s / 2, 6); if (hasFill) ctx.fill(); ctx.stroke(); break;
        }
        // 选中状态：控制点 + 旋转手柄
        const selectedObjId = VC.State ? VC.State.selectedObjectId : null;
        if (obj.id === selectedObjId) {
            drawResizeHandles(ctx, ox, oy, s, obj.shape);
            const halfW2 = s / 2;
            const halfH2 = (obj.shape === 'rectangle') ? s * 0.7 / 2 : halfW2;
            const rotHX = ox + halfW2 + 18;
            const rotHY = oy + halfH2 + 18;
            ctx.beginPath(); ctx.moveTo(ox + halfW2 + 2, oy + halfH2 + 2); ctx.lineTo(rotHX, rotHY);
            ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(rotHX, rotHY, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#4A90D9'; ctx.fill();
            ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
    }

    // ── 公开 API ──
    VC.ShapeRenderer = {
        SIZES, POSITIONS, resolveSize, drawShape, drawStar, drawPolygon,
        drawResizeHandles, hitTestResizeHandle
    };

    // 全局兼容（HTML onclick 等需要）
    window.resolveSize = resolveSize;
    window.drawShape = drawShape;
    window.drawStar = drawStar;
    window.drawPolygon = drawPolygon;
    window.drawResizeHandles = drawResizeHandles;
    window.hitTestResizeHandle = hitTestResizeHandle;
    window.SIZES = SIZES;
    window.POSITIONS = POSITIONS;

    console.log('[ShapeRenderer] 形状渲染模块加载完成');
})();
