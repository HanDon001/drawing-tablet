/**
 * VC.Vector — 矢量图形生成器
 * 基于 Path2D API，支持参数化矢量图形和 SVG 路径解析
 */
(function () {
    'use strict';

    const generators = {
        /**
         * 心形：贝塞尔曲线
         */
        heart(size) {
            const p = new Path2D();
            const s = size * 0.01;
            p.moveTo(0, -20 * s);
            p.bezierCurveTo(-40 * s, -60 * s, -80 * s, -10 * s, 0, 50 * s);
            p.moveTo(0, -20 * s);
            p.bezierCurveTo(40 * s, -60 * s, 80 * s, -10 * s, 0, 50 * s);
            return p;
        },

        /**
         * 螺旋线
         */
        spiral(size) {
            const p = new Path2D();
            const s = size * 0.01;
            for (let i = 0; i < 200; i++) {
                const angle = (i / 200) * 4 * Math.PI * 2;
                const r = (i / 200) * 50 * s;
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                i === 0 ? p.moveTo(px, py) : p.lineTo(px, py);
            }
            return p;
        },

        /**
         * 波浪线
         */
        wave(size) {
            const p = new Path2D();
            const s = size * 0.01;
            p.moveTo(-80 * s, 0);
            for (let i = 0; i <= 160; i += 2) {
                p.lineTo((-80 + i) * s, Math.sin(i * 0.1) * 20 * s);
            }
            return p;
        },

        /**
         * 齿轮
         */
        gear(size) {
            const p = new Path2D();
            const s = size * 0.01;
            const teeth = 8, outer = 40 * s, inner = 28 * s;
            for (let i = 0; i < teeth; i++) {
                const a1 = (i / teeth) * Math.PI * 2;
                const a2 = ((i + 0.3) / teeth) * Math.PI * 2;
                const a3 = ((i + 0.5) / teeth) * Math.PI * 2;
                const a4 = ((i + 0.8) / teeth) * Math.PI * 2;
                if (i === 0) p.moveTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
                else p.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
                p.lineTo(Math.cos(a2) * outer, Math.sin(a2) * outer);
                p.lineTo(Math.cos(a3) * outer, Math.sin(a3) * outer);
                p.lineTo(Math.cos(a4) * inner, Math.sin(a4) * inner);
            }
            p.closePath();
            return p;
        },

        /**
         * 分形树
         */
        tree(size) {
            const p = new Path2D();
            const s = size * 0.01;
            function branch(bx, by, len, angle, depth) {
                if (depth === 0) return;
                const ex = bx + Math.cos(angle) * len;
                const ey = by + Math.sin(angle) * len;
                p.moveTo(bx, by);
                p.lineTo(ex, ey);
                branch(ex, ey, len * 0.7, angle - 0.5, depth - 1);
                branch(ex, ey, len * 0.7, angle + 0.5, depth - 1);
            }
            branch(0, 40 * s, 40 * s, -Math.PI / 2, 6);
            return p;
        },

        /**
         * 云朵：多个圆组合
         */
        cloud(size) {
            const p = new Path2D();
            const s = size * 0.01;
            [[0, 0, 30], [-25, 5, 22], [25, 5, 22], [-12, -12, 18], [12, -12, 18]].forEach(([cx, cy, r]) => {
                p.moveTo(cx * s + r * s, cy * s);
                p.arc(cx * s, cy * s, r * s, 0, Math.PI * 2);
            });
            return p;
        },

        /**
         * 闪电
         */
        lightning(size) {
            const p = new Path2D();
            const s = size * 0.01;
            p.moveTo(0, -50 * s);
            p.lineTo(15 * s, -10 * s);
            p.lineTo(5 * s, -10 * s);
            p.lineTo(20 * s, 50 * s);
            p.lineTo(-5 * s, 10 * s);
            p.lineTo(5 * s, 10 * s);
            p.closePath();
            return p;
        },

        /**
         * 花朵：花瓣 + 花心
         */
        flower(size) {
            const p = new Path2D();
            const s = size * 0.01;
            const petals = 5, r = 25 * s;
            for (let i = 0; i < petals; i++) {
                const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
                const cx = Math.cos(a) * r * 0.6;
                const cy = Math.sin(a) * r * 0.6;
                p.moveTo(cx + 12 * s, cy);
                p.arc(cx, cy, 12 * s, 0, Math.PI * 2);
            }
            p.moveTo(10 * s, 0);
            p.arc(0, 0, 10 * s, 0, Math.PI * 2);
            return p;
        },

        /**
         * 弯曲箭头
         */
        arrow_curve(size) {
            const p = new Path2D();
            const s = size * 0.01;
            p.moveTo(-50 * s, 0);
            p.quadraticCurveTo(0, -40 * s, 50 * s, 0);
            p.lineTo(35 * s, -10 * s);
            p.moveTo(50 * s, 0);
            p.lineTo(35 * s, 10 * s);
            return p;
        },
    };

    // ── 公开 API ──────────────────────────────────────

    VC.Vector = {
        /**
         * 获取所有可用的矢量图形类型
         */
        getTypes() {
            return Object.keys(generators);
        },

        /**
         * 生成矢量 Path2D
         * @param {string} type - 图形类型
         * @param {number} size - 基础尺寸(像素)
         * @returns {Path2D|null}
         */
        generate(type, size) {
            const gen = generators[type];
            if (!gen) {
                console.warn('[Vector] 未知图形类型:', type);
                return null;
            }
            return gen(size);
        },

        /**
         * 解析 SVG 路径字符串
         * @param {string} svgD - SVG path d 属性
         * @returns {Path2D|null}
         */
        parseSVG(svgD) {
            try {
                return new Path2D(svgD);
            } catch (e) {
                console.warn('[Vector] SVG 路径解析失败:', e);
                return null;
            }
        },

        /**
         * 检查是否支持某种图形类型
         */
        hasType(type) {
            return type in generators;
        },
    };

    console.log('[Vector] 矢量图形模块加载完成, 支持:', Object.keys(generators).join(', '));
})();
