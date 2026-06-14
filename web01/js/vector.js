/**
 * VC.Vector — 矢量图形生成器
 * 返回 SVG 路径字符串，供 Fabric.js 使用
 */
(function () {
    'use strict';

    const generators = {
        /**
         * 心形：贝塞尔曲线
         */
        heart(size) {
            const s = size * 0.01;
            return `M 0 ${-20 * s} C ${-40 * s} ${-60 * s}, ${-80 * s} ${-10 * s}, 0 ${50 * s} M 0 ${-20 * s} C ${40 * s} ${-60 * s}, ${80 * s} ${-10 * s}, 0 ${50 * s}`;
        },

        /**
         * 螺旋线
         */
        spiral(size) {
            const s = size * 0.01;
            let path = '';
            for (let i = 0; i < 200; i++) {
                const angle = (i / 200) * 4 * Math.PI * 2;
                const r = (i / 200) * 50 * s;
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                path += (i === 0 ? 'M' : 'L') + ` ${px} ${py} `;
            }
            return path;
        },

        /**
         * 波浪线
         */
        wave(size) {
            const s = size * 0.01;
            let path = `M ${-80 * s} 0`;
            for (let i = 0; i <= 160; i += 2) {
                path += ` L ${(-80 + i) * s} ${Math.sin(i * 0.1) * 20 * s}`;
            }
            return path;
        },

        /**
         * 齿轮
         */
        gear(size) {
            const s = size * 0.01;
            const teeth = 8, outer = 40 * s, inner = 28 * s;
            let path = '';
            for (let i = 0; i < teeth; i++) {
                const a1 = (i / teeth) * Math.PI * 2;
                const a2 = ((i + 0.3) / teeth) * Math.PI * 2;
                const a3 = ((i + 0.5) / teeth) * Math.PI * 2;
                const a4 = ((i + 0.8) / teeth) * Math.PI * 2;
                if (i === 0) path += `M ${Math.cos(a1) * inner} ${Math.sin(a1) * inner}`;
                else path += ` L ${Math.cos(a1) * inner} ${Math.sin(a1) * inner}`;
                path += ` L ${Math.cos(a2) * outer} ${Math.sin(a2) * outer}`;
                path += ` L ${Math.cos(a3) * outer} ${Math.sin(a3) * outer}`;
                path += ` L ${Math.cos(a4) * inner} ${Math.sin(a4) * inner}`;
            }
            path += ' Z';
            return path;
        },

        /**
         * 分形树
         */
        tree(size) {
            const s = size * 0.01;
            let path = '';
            function branch(bx, by, len, angle, depth) {
                if (depth === 0) return;
                const ex = bx + Math.cos(angle) * len;
                const ey = by + Math.sin(angle) * len;
                path += ` M ${bx} ${by} L ${ex} ${ey}`;
                branch(ex, ey, len * 0.7, angle - 0.5, depth - 1);
                branch(ex, ey, len * 0.7, angle + 0.5, depth - 1);
            }
            branch(0, 40 * s, 40 * s, -Math.PI / 2, 6);
            return path;
        },

        /**
         * 云朵
         */
        cloud(size) {
            const s = size * 0.01;
            const circles = [[0, 0, 30], [-25, 5, 22], [25, 5, 22], [-12, -12, 18], [12, -12, 18]];
            let path = '';
            circles.forEach(([cx, cy, r]) => {
                const x = cx * s, y = cy * s, rad = r * s;
                path += ` M ${x + rad} ${y}`;
                path += ` A ${rad} ${rad} 0 1 0 ${x - rad} ${y}`;
                path += ` A ${rad} ${rad} 0 1 0 ${x + rad} ${y}`;
            });
            return path;
        },

        /**
         * 闪电
         */
        lightning(size) {
            const s = size * 0.01;
            return `M 0 ${-50 * s} L ${15 * s} ${-10 * s} L ${5 * s} ${-10 * s} L ${20 * s} ${50 * s} L ${-5 * s} ${10 * s} L ${5 * s} ${10 * s} Z`;
        },

        /**
         * 花朵
         */
        flower(size) {
            const s = size * 0.01;
            const petals = 5, r = 25 * s;
            let path = '';
            for (let i = 0; i < petals; i++) {
                const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
                const cx = Math.cos(a) * r * 0.6;
                const cy = Math.sin(a) * r * 0.6;
                const pr = 12 * s;
                path += ` M ${cx + pr} ${cy}`;
                path += ` A ${pr} ${pr} 0 1 0 ${cx - pr} ${cy}`;
                path += ` A ${pr} ${pr} 0 1 0 ${cx + pr} ${cy}`;
            }
            // 花心
            const cr = 10 * s;
            path += ` M ${cr} 0`;
            path += ` A ${cr} ${cr} 0 1 0 ${-cr} 0`;
            path += ` A ${cr} ${cr} 0 1 0 ${cr} 0`;
            return path;
        },

        /**
         * 弯曲箭头
         */
        arrow_curve(size) {
            const s = size * 0.01;
            return `M ${-50 * s} 0 Q 0 ${-40 * s}, ${50 * s} 0 L ${35 * s} ${-10 * s} M ${50 * s} 0 L ${35 * s} ${10 * s}`;
        },
    };

    // ── 公开 API ──

    VC.Vector = {
        /**
         * 获取所有可用的矢量图形类型
         */
        getTypes() {
            return Object.keys(generators);
        },

        /**
         * 生成 SVG 路径字符串
         * @param {string} type - 图形类型
         * @param {number} size - 基础尺寸(像素)
         * @returns {string|null} SVG path d 属性
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
         * 解析 SVG 路径字符串（直接返回）
         * @param {string} svgD - SVG path d 属性
         * @returns {string}
         */
        parseSVG(svgD) {
            return svgD;
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
