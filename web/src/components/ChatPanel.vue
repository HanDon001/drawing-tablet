<template>
  <div class="chat-panel" :class="{ 'is-open': isOpen }">
    <!-- 标题栏 -->
    <div class="chat-header" @click="isOpen = !isOpen">
      <span class="chat-title">💬 小画助手</span>
      <span class="chat-toggle">{{ isOpen ? '▼' : '▲' }}</span>
      <span v-if="!isOpen && unreadCount" class="unread-badge">{{ unreadCount }}</span>
    </div>

    <!-- 消息列表 -->
    <div v-show="isOpen" class="chat-body" ref="chatBody">
      <div v-if="messages.length === 0" class="chat-empty">
        说出你想画的内容吧 🎨
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat-msg"
        :class="msg.role"
      >
        <div class="msg-avatar">{{ msg.role === 'user' ? '👤' : '🎨' }}</div>
        <div class="msg-content">
          <div class="msg-text">{{ msg.text }}</div>
          <div class="msg-time">{{ formatTime(msg.time) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  time: number
}

const props = defineProps<{
  messages: ChatMessage[]
}>()

const isOpen = ref(false)
const unreadCount = ref(0)
const chatBody = ref<HTMLElement | null>(null)

// 新消息时自动滚动 & 未读计数
watch(() => props.messages.length, async () => {
  if (isOpen.value) {
    await nextTick()
    scrollToBottom()
    unreadCount.value = 0
  } else {
    unreadCount.value++
  }
})

// 打开面板时滚动到底部 & 清除未读
watch(isOpen, async (val) => {
  if (val) {
    unreadCount.value = 0
    await nextTick()
    scrollToBottom()
  }
})

function scrollToBottom() {
  if (chatBody.value) {
    chatBody.value.scrollTop = chatBody.value.scrollHeight
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<style scoped>
.chat-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 320px;
  background: rgba(26, 26, 46, 0.95);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 998;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: height 0.3s ease;
}

.chat-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.chat-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.chat-title {
  flex: 1;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.chat-toggle {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.unread-badge {
  position: absolute;
  top: 6px;
  right: 36px;
  background: #f5576c;
  color: white;
  font-size: 11px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}

.chat-body {
  height: 360px;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-body::-webkit-scrollbar {
  width: 4px;
}

.chat-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.chat-empty {
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  padding: 60px 0;
  font-size: 14px;
}

.chat-msg {
  display: flex;
  gap: 8px;
  max-width: 90%;
}

.chat-msg.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-msg.assistant {
  align-self: flex-start;
}

.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.msg-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.msg-text {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.chat-msg.user .msg-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-msg.assistant .msg-text {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  border-bottom-left-radius: 4px;
}

.msg-time {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  padding: 0 4px;
}

.chat-msg.user .msg-time {
  text-align: right;
}
</style>
