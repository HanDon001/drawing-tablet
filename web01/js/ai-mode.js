/**
 * VC.AIMode — AI 模式模块
 * 从 index.html 内联 JS 拆分
 * 负责：AI 陪伴模式、多模态模式的激活/停用
 */
(function () {
    'use strict';

    let currentMode = 'normal';
    let isAIListening = false;

    function showAITextBubble(text) {
        const bubble = document.getElementById('aiTextBubble');
        const span = document.getElementById('aiTranscriptText');
        span.textContent = text;
        if (text && text !== '正在聆听...') {
            bubble.classList.add('visible');
        } else if (text === '正在聆听...') {
            bubble.classList.add('visible');
        } else {
            bubble.classList.remove('visible');
        }
    }

    function toggleVoiceInAIMode() {
        const state = (typeof VC !== 'undefined' && VC.Companion) ? VC.Companion.getState() : 'unknown';
        console.log('[AI] 当前状态:', state);
    }

    /* ========== AI 陪伴模式 ========== */
    async function activateAIMode() {
        currentMode = 'ai';
        await VC.Effects.playSuperTransition();
        document.body.classList.remove('multi-mode');
        document.body.classList.add('ai-mode');
        document.getElementById('normalTranscript').style.display = 'none';
        document.getElementById('micBtn').style.display = 'none';
        document.getElementById('aiControlArea').style.display = '';
        document.getElementById('aiVizWrap').classList.add('active');
        document.getElementById('aiModeLabel').classList.add('active');
        showAITextBubble('正在聆听...');
        document.getElementById('agentCard').classList.add('ai-active');
        VC.Effects.showModeIndicator('AI COMPANION MODE');
        document.getElementById('modeTag').textContent = 'AI';
        document.getElementById('chatHeadName').textContent = 'AI 画伴';
        VC.Effects.startBgParticles();
        VC.Effects.startVizAnimation();

        if (typeof VC !== 'undefined' && VC.Companion) {
            let greeted = false;
            VC.Companion.start({
                onPartial: (text) => { showAITextBubble('🎤 ' + text); },
                onFinal: (text) => {
                    showAITextBubble(text);
                    VC.Chat.addChat('user', text);
                },
                onActions: async (actions) => {
                    if (VC.Cmd && VC.Cmd.executeActions) {
                        await VC.Cmd.executeActions(actions);
                    } else if (VC.Cmd) {
                        for (const action of actions) { VC.Cmd.execute(action); }
                    }
                    VC.CanvasInteraction.redrawAll();
                },
                onReply: (text) => {
                    showAITextBubble(text);
                    VC.Chat.addChat('assistant', text);
                },
                onStateChange: (newState, oldState) => {
                    switch (newState) {
                        case 'idle':
                            showAITextBubble('正在聆听...');
                            if (!greeted) {
                                greeted = true;
                                const greeting = '你好呀！我是小画，有什么可以帮你的吗？';
                                showAITextBubble(greeting);
                                VC.Chat.addChat('assistant', greeting);
                                VC.Voice.speak(greeting);
                            }
                            break;
                        case 'listening': showAITextBubble('🎤 听到你在说话...'); break;
                        case 'processing': showAITextBubble('🧠 思考中...'); break;
                        case 'proactive': showAITextBubble('💭 让我想想...'); break;
                    }
                },
            }).catch(e => {
                console.error('[AI] 陪伴模式启动失败:', e);
                showAITextBubble('⚠️ 启动失败: ' + e.message);
            });
        }
        window.agentRunning = true;
        VC.Chat.addChat('assistant', 'AI 陪伴模式已激活。我会持续聆听你的创作指令，随时为你服务。');
    }

    function deactivateAIMode() {
        currentMode = 'normal';
        document.body.classList.remove('ai-mode');
        document.getElementById('normalTranscript').style.display = '';
        document.getElementById('micBtn').style.display = '';
        document.getElementById('aiControlArea').style.display = 'none';
        document.getElementById('aiVizWrap').classList.remove('active');
        document.getElementById('aiModeLabel').classList.remove('active');
        document.getElementById('aiTextBubble').classList.remove('visible');
        document.getElementById('agentCard').classList.remove('ai-active');
        document.getElementById('modeTag').textContent = 'PRO';
        document.getElementById('chatHeadName').textContent = '小画助手';
        VC.Effects.hideModeIndicator();
        VC.Effects.stopBgParticles();
        VC.Effects.stopVizAnimation();
        if (typeof VC !== 'undefined' && VC.Companion) VC.Companion.stop();
        window.agentRunning = false;
        VC.Chat.addChat('assistant', 'AI 陪伴模式已关闭，回到标准模式。');
    }

    /* ========== 多模态模式 ========== */
    async function activateMultiModal() {
        currentMode = 'multi';
        await VC.Effects.playSuperTransition();
        document.body.classList.remove('ai-mode');
        document.body.classList.add('multi-mode');
        document.getElementById('normalTranscript').style.display = 'none';
        document.getElementById('micBtn').style.display = 'none';
        document.getElementById('aiControlArea').style.display = '';
        document.getElementById('aiVizWrap').classList.add('active');
        document.getElementById('aiModeLabel').classList.add('active');
        document.getElementById('aiTextBubble').classList.add('visible');
        document.getElementById('multimodalCard').classList.add('multi-active');
        VC.Effects.showModeIndicator('MULTIMODAL FUSION');
        document.getElementById('modeTag').textContent = 'MULTI';
        document.getElementById('chatHeadName').textContent = '多模态 AI';
        VC.Effects.startBgParticles();
        VC.Effects.startVizAnimation();
        VC.Chat.addChat('assistant', '多模态融合模式已激活。语音、视觉、触控多通道已连接，体验全景交互。');
    }

    function deactivateMultiModal() {
        currentMode = 'normal';
        document.body.classList.remove('multi-mode');
        document.getElementById('normalTranscript').style.display = '';
        document.getElementById('micBtn').style.display = '';
        document.getElementById('aiControlArea').style.display = 'none';
        document.getElementById('aiVizWrap').classList.remove('active');
        document.getElementById('aiModeLabel').classList.remove('active');
        document.getElementById('aiTextBubble').classList.remove('visible');
        document.getElementById('multimodalCard').classList.remove('multi-active');
        document.getElementById('modeTag').textContent = 'PRO';
        document.getElementById('chatHeadName').textContent = '小画助手';
        VC.Effects.hideModeIndicator();
        VC.Effects.stopBgParticles();
        VC.Effects.stopVizAnimation();
        if (isAIListening) toggleVoiceInAIMode();
        VC.Chat.addChat('assistant', '多模态模式已关闭，回到标准模式。');
    }

    // ── 公开 API ──
    VC.AIMode = {
        activateAIMode, deactivateAIMode,
        activateMultiModal, deactivateMultiModal,
        showAITextBubble, toggleVoiceInAIMode,
        get currentMode() { return currentMode; },
        get isAIListening() { return isAIListening; },
        set isAIListening(v) { isAIListening = v; }
    };

    // 全局兼容
    window.activateAIMode = activateAIMode;
    window.deactivateAIMode = deactivateAIMode;
    window.activateMultiModal = activateMultiModal;
    window.deactivateMultiModal = deactivateMultiModal;
    window.showAITextBubble = showAITextBubble;
    window.toggleVoiceInAIMode = toggleVoiceInAIMode;

    console.log('[AIMode] AI 模式模块加载完成');
})();
