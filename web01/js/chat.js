/**
 * VC.Chat — 聊天面板模块
 * 从 index.html 内联 JS 拆分
 * 负责：聊天消息、发送、快捷命令、输入框自适应
 */
(function () {
    'use strict';

    function addChat(role, text) {
        const body = document.getElementById('chatBody');
        const empty = document.getElementById('chatEmpty');
        if (empty) empty.remove();
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const ac = role === 'user' ? 'me' : 'ai';
        const ai = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        const div = document.createElement('div');
        div.className = `msg-row ${role}`;
        div.innerHTML = `<div class="msg-avatar ${ac}">${ai}</div><div class="msg-body"><div class="msg-bubble">${text}</div><div class="msg-time" style="font-size:8px;color:#999;padding:0 4px;">${time}</div></div>`;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function sendChatMessage() {
        const input = document.getElementById('chatInput'), text = input.value.trim();
        if (!text) return;
        input.value = '';
        resizeInput();
        if (window.agentRunning && typeof VC !== 'undefined' && VC.Companion) {
            addChat('user', text);
            VC.Companion.sendText(text);
        } else {
            if (typeof VC !== 'undefined' && VC.Cmd) {
                VC.Cmd.processText(text);
            } else {
                addChat('user', text);
                if (VC.LocalCommands) VC.LocalCommands.processVoiceCommand(text);
            }
        }
    }

    function handleChatKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    }

    function resizeInput() {
        const el = document.getElementById('chatInput');
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 64) + 'px';
        document.getElementById('sendBtn').disabled = !el.value.trim();
    }

    function useQuick(text) {
        if (window.agentRunning && typeof VC !== 'undefined' && VC.Companion) {
            addChat('user', text);
            VC.Companion.sendText(text);
        } else {
            if (typeof VC !== 'undefined' && VC.Cmd) {
                VC.Cmd.processText(text);
            } else {
                addChat('user', text);
                if (VC.LocalCommands) VC.LocalCommands.processVoiceCommand(text);
            }
        }
    }

    function clearChatHistory() {
        document.getElementById('chatBody').innerHTML = `<div class="text-center py-8 px-4" id="chatEmpty"><div class="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style="background:linear-gradient(135deg,#F5EFE6,#E8D9C7);"><i class="fas fa-wand-magic-sparkles text-xl" style="color:#B8A898;"></i></div><div class="text-xs font-semibold mb-1" style="color:#7A4F28;">开始创作对话</div><div class="text-[10px] leading-relaxed" style="color:#B8A898;">说出或输入绘图指令<br>小画助手帮你实现</div></div>`;
    }

    function showTyping() {
        if (document.getElementById('typingIndicator')) return;
        const body = document.getElementById('chatBody');
        const empty = document.getElementById('chatEmpty');
        if (empty) empty.remove();
        const div = document.createElement('div');
        div.id = 'typingIndicator';
        div.className = 'msg-row assistant';
        div.innerHTML = '<div class="msg-avatar ai"><i class="fas fa-robot"></i></div>'
            + '<div class="msg-body"><div class="msg-bubble" style="opacity:0.6">'
            + '<i class="fas fa-spinner fa-spin"></i> 思考中...</div></div>';
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function hideTyping() {
        const el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    function init() {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.addEventListener('input', resizeInput);
        console.log('[Chat] 聊天模块初始化完成');
    }

    // ── 公开 API ──
    VC.Chat = {
        init, addChat, sendChatMessage, handleChatKey, resizeInput,
        useQuick, clearChatHistory, showTyping, hideTyping
    };

    // 全局兼容（HTML onclick 等）
    window.addChat = addChat;
    window.sendChatMessage = sendChatMessage;
    window.handleChatKey = handleChatKey;
    window.resizeInput = resizeInput;
    window.useQuick = useQuick;
    window.clearChatHistory = clearChatHistory;
    window.showTyping = showTyping;
    window.hideTyping = hideTyping;
    window.addChatMessage = addChat;

    console.log('[Chat] 聊天模块加载完成');
})();
