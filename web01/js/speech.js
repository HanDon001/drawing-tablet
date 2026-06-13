/**
 * VC.Speech — 语音识别模块
 * 从 index.html 内联 JS 拆分
 * 负责：Web Speech API 初始化、录音控制
 */
(function () {
    'use strict';

    let recognition = null;
    let isListening = false;

    function initRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';
        recognition.onresult = e => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t; else interim += t;
            }
            const display = final || interim;
            const transcriptEl = document.getElementById('transcriptText');
            if (transcriptEl) { transcriptEl.textContent = display; transcriptEl.style.opacity = '1'; }
            const aiTranscriptEl = document.getElementById('aiTranscriptText');
            if (aiTranscriptEl) aiTranscriptEl.textContent = display || '正在聆听...';
            if (final) {
                if (typeof VC !== 'undefined' && VC.Cmd) {
                    VC.Cmd.processText(final);
                } else if (VC.LocalCommands) {
                    VC.LocalCommands.processVoiceCommand(final);
                }
            }
        };
        recognition.onerror = () => stopListening();
        recognition.onend = () => {
            if (isListening || (VC.AIMode && VC.AIMode.isAIListening)) {
                try { recognition.start(); } catch (e) { }
            }
        };
    }

    function startListening() {
        if (!recognition) return;
        isListening = true;
        document.getElementById('micBtn').classList.add('mic-pulse');
        document.getElementById('micBtn').querySelector('i').className = 'fas fa-stop';
        try { recognition.start(); } catch (e) { }
        document.getElementById('statusText').textContent = '聆听中';
    }

    function stopListening() {
        isListening = false;
        document.getElementById('micBtn').classList.remove('mic-pulse');
        document.getElementById('micBtn').querySelector('i').className = 'fas fa-microphone';
        try { recognition.stop(); } catch (e) { }
        document.getElementById('statusText').textContent = '就绪';
    }

    function init() {
        initRecognition();
        document.getElementById('micBtn').addEventListener('click', () => {
            if (isListening) stopListening(); else startListening();
        });
        console.log('[Speech] 语音识别模块初始化完成');
    }

    // ── 公开 API ──
    VC.Speech = {
        init, startListening, stopListening,
        get isListening() { return isListening; }
    };

    // 全局兼容
    window.startListening = startListening;
    window.stopListening = stopListening;

    console.log('[Speech] 语音识别模块加载完成');
})();
