/**
 * VC.Effects — 视觉效果模块
 * 从 index.html 内联 JS 拆分
 * 负责：彩虹转场、背景粒子、声波可视化、模式指示器
 */
(function () {
    'use strict';

    const RAINBOW_COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'];
    let bgParticlesActive = false, bgParticleList = [], bgAnimId = null, vizAnimId = null;

    /* ========== 彩虹转场动画 ========== */
    function playSuperTransition() {
        return new Promise(resolve => {
            const canvas = document.getElementById('transCanvas'), ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
            const cx = canvas.width / 2, cy = canvas.height / 2, maxR = Math.sqrt(cx * cx + cy * cy);
            const particles = [];
            for (let i = 0; i < 120; i++) {
                const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 14;
                particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 1 + Math.random() * 3, life: 1, decay: 0.007 + Math.random() * 0.013, color: RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)], trail: [] });
            }
            const rings = [];
            for (let i = 0; i < 4; i++) rings.push({ r: 0, maxR: maxR * (0.5 + i * 0.18), speed: 10 + i * 3, width: 3 - i * 0.5, alpha: 0.5 - i * 0.08, color: RAINBOW_COLORS[i], delay: i * 5 });
            const lines = [];
            for (let i = 0; i < 18; i++) {
                const a = (Math.PI * 2 / 18) * i;
                lines.push({ angle: a, length: 0, maxLength: maxR * 0.6, speed: 14 + Math.random() * 8, alpha: 0.25 + Math.random() * 0.2, color: RAINBOW_COLORS[i % RAINBOW_COLORS.length] });
            }
            let frame = 0; const totalFrames = 80; const flash = document.getElementById('flashOverlay');

            function animate() {
                frame++; ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (frame < 16) {
                    const p = frame / 16, gR = 80 * (1 - p) + 5;
                    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gR);
                    grad.addColorStop(0, 'rgba(255,107,107,0.7)'); grad.addColorStop(0.3, 'rgba(254,202,87,0.5)');
                    grad.addColorStop(0.6, 'rgba(72,219,251,0.3)'); grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, gR, 0, Math.PI * 2); ctx.fill();
                    for (let i = 0; i < 10; i++) {
                        const a = (Math.PI * 2 / 10) * i + frame * 0.1, dist = 180 * (1 - p);
                        ctx.fillStyle = RAINBOW_COLORS[i % RAINBOW_COLORS.length]; ctx.globalAlpha = 0.4 + p * 0.4;
                        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 2, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                }
                if (frame === 16) { flash.classList.add('active'); setTimeout(() => flash.classList.remove('active'), 200); }
                if (frame >= 16) {
                    rings.forEach(ring => {
                        const rf = Math.max(0, frame - 16 - ring.delay); if (rf <= 0) return;
                        ring.r = Math.min(ring.maxR, rf * ring.speed);
                        const a = ring.alpha * (1 - ring.r / ring.maxR); if (a <= 0) return;
                        ctx.strokeStyle = ring.color; ctx.globalAlpha = a; ctx.lineWidth = ring.width;
                        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, ring.r), 0, Math.PI * 2); ctx.stroke();
                    });
                    lines.forEach(line => {
                        line.length = Math.min(line.maxLength, (frame - 16) * line.speed);
                        const a = line.alpha * (1 - line.length / line.maxLength); if (a <= 0) return;
                        ctx.strokeStyle = line.color; ctx.globalAlpha = a; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.moveTo(cx, cy);
                        ctx.lineTo(cx + Math.cos(line.angle) * line.length, cy + Math.sin(line.angle) * line.length);
                        ctx.stroke();
                    });
                    particles.forEach(p => {
                        p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97;
                        p.life -= p.decay; if (p.life <= 0) return;
                        p.trail.push({ x: p.x, y: p.y, a: p.life });
                        if (p.trail.length > 6) p.trail.shift();
                        p.trail.forEach((t, idx) => {
                            const ta = t.a * (idx / p.trail.length) * 0.3; if (ta <= 0) return;
                            ctx.fillStyle = p.color; ctx.globalAlpha = ta;
                            ctx.beginPath(); ctx.arc(t.x, t.y, p.size * ta * 0.5, 0, Math.PI * 2); ctx.fill();
                        });
                        ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
                        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
                        ctx.globalAlpha = p.life * 0.15;
                        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life * 3, 0, Math.PI * 2); ctx.fill();
                    });
                    ctx.globalAlpha = 1;
                    if ((frame - 16) / (totalFrames - 16) < 0.5) {
                        const ep = (frame - 16) / (totalFrames - 16), gA = 0.3 * (1 - ep * 2);
                        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140 * (1 + ep));
                        grad.addColorStop(0, `rgba(255,107,107,${gA})`); grad.addColorStop(0.4, `rgba(254,202,87,${gA * 0.5})`);
                        grad.addColorStop(0.7, `rgba(72,219,251,${gA * 0.3})`); grad.addColorStop(1, 'transparent');
                        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, 140 * (1 + ep), 0, Math.PI * 2); ctx.fill();
                    }
                }
                if (frame >= 20 && frame < 50) {
                    const sp = (frame - 20) / 30, sy = canvas.height * sp;
                    const sg = ctx.createLinearGradient(0, sy - 40, 0, sy + 40);
                    sg.addColorStop(0, 'transparent'); sg.addColorStop(0.4, 'rgba(254,202,87,0.08)');
                    sg.addColorStop(0.6, 'rgba(72,219,251,0.08)'); sg.addColorStop(1, 'transparent');
                    ctx.fillStyle = sg; ctx.fillRect(0, sy - 40, canvas.width, 80);
                }
                if (frame < totalFrames) requestAnimationFrame(animate);
                else { ctx.clearRect(0, 0, canvas.width, canvas.height); resolve(); }
            }
            animate();
        });
    }

    /* ========== 背景彩虹粒子 ========== */
    function startBgParticles() {
        const canvas = document.getElementById('bgParticles'), ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        bgParticleList = [];
        for (let i = 0; i < 50; i++) {
            bgParticleList.push({
                x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                size: 0.8 + Math.random() * 2, speedX: (Math.random() - 0.5) * 0.3, speedY: (Math.random() - 0.5) * 0.2,
                alpha: 0.08 + Math.random() * 0.15, pulse: Math.random() * Math.PI * 2,
                pulseSpeed: 0.01 + Math.random() * 0.015,
                color: RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)]
            });
        }
        bgParticlesActive = true;
        function drawBg() {
            if (!bgParticlesActive) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            bgParticleList.forEach(p => {
                p.x += p.speedX; p.y += p.speedY; p.pulse += p.pulseSpeed;
                if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
                const a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
                ctx.fillStyle = p.color; ctx.globalAlpha = a;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = a * 0.15;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2); ctx.fill();
            });
            ctx.globalAlpha = 1;
            for (let i = 0; i < bgParticleList.length; i++) {
                for (let j = i + 1; j < bgParticleList.length; j++) {
                    const dx = bgParticleList[i].x - bgParticleList[j].x, dy = bgParticleList[i].y - bgParticleList[j].y, dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 110) {
                        ctx.strokeStyle = bgParticleList[i].color; ctx.globalAlpha = 0.03 * (1 - dist / 110);
                        ctx.lineWidth = 0.5; ctx.beginPath();
                        ctx.moveTo(bgParticleList[i].x, bgParticleList[i].y);
                        ctx.lineTo(bgParticleList[j].x, bgParticleList[j].y); ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1; bgAnimId = requestAnimationFrame(drawBg);
        }
        drawBg();
    }

    function stopBgParticles() {
        bgParticlesActive = false;
        if (bgAnimId) cancelAnimationFrame(bgAnimId);
        const c = document.getElementById('bgParticles'), ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
    }

    /* ========== 彩虹声波可视化 ========== */
    function startVizAnimation() {
        const canvas = document.getElementById('vizCanvas'), ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
        let t = 0;
        function drawViz() {
            t += 0.03; ctx.clearRect(0, 0, w, h);
            for (let i = 0; i < 3; i++) {
                const r = 75 + i * 15;
                ctx.strokeStyle = RAINBOW_COLORS[(i + Math.floor(t)) % RAINBOW_COLORS.length];
                ctx.globalAlpha = 0.06 + Math.sin(t + i) * 0.02; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            }
            const isAIListening = VC.AIMode ? VC.AIMode.isAIListening : false;
            for (let i = 0; i < 36; i++) {
                const angle = (Math.PI * 2 / 36) * i + t * 0.5, innerR = 40;
                const waveLen = 15 + Math.sin(t * 2 + i * 0.5) * 8 + (isAIListening ? Math.sin(t * 3 + i) * 10 : 0);
                const outerR = innerR + waveLen;
                ctx.strokeStyle = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
                ctx.globalAlpha = 0.2 + Math.sin(t + i * 0.3) * 0.08; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
                ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR); ctx.stroke();
            }
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i + t, r = 88 + Math.sin(t * 2 + i) * 5;
                const px = cx + Math.cos(angle) * r, py = cy + Math.sin(angle) * r;
                ctx.fillStyle = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
                ctx.globalAlpha = 0.35 + Math.sin(t + i) * 0.2;
                ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1; vizAnimId = requestAnimationFrame(drawViz);
        }
        drawViz();
    }

    function stopVizAnimation() {
        if (vizAnimId) cancelAnimationFrame(vizAnimId);
        const c = document.getElementById('vizCanvas'), ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
    }

    /* ========== 模式指示器 ========== */
    function showModeIndicator(t) {
        const el = document.getElementById('modeIndicator');
        el.textContent = t; el.classList.add('visible');
    }
    function hideModeIndicator() {
        document.getElementById('modeIndicator').classList.remove('visible');
    }

    /* ========== 窗口 resize ========== */
    function init() {
        window.addEventListener('resize', () => {
            if (bgParticlesActive) {
                const c = document.getElementById('bgParticles');
                c.width = window.innerWidth; c.height = window.innerHeight;
            }
        });
        console.log('[Effects] 视觉效果模块初始化完成');
    }

    // ── 公开 API ──
    VC.Effects = {
        init, playSuperTransition,
        startBgParticles, stopBgParticles,
        startVizAnimation, stopVizAnimation,
        showModeIndicator, hideModeIndicator
    };

    // 全局兼容
    window.playSuperTransition = playSuperTransition;
    window.startBgParticles = startBgParticles;
    window.stopBgParticles = stopBgParticles;
    window.startVizAnimation = startVizAnimation;
    window.stopVizAnimation = stopVizAnimation;
    window.showModeIndicator = showModeIndicator;
    window.hideModeIndicator = hideModeIndicator;

    console.log('[Effects] 视觉效果模块加载完成');
})();
