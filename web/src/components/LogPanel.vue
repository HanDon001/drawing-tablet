<template>
  <div class="log-panel" :class="{ 'is-open': isOpen }">
    <!-- 标题栏 -->
    <div class="log-header" @click="isOpen = !isOpen">
      <span class="log-title">📋 日志</span>
      <span class="log-toggle">{{ isOpen ? '▼' : '▲' }}</span>
    </div>

    <!-- 日志列表 -->
    <div v-show="isOpen" class="log-body" ref="logBody">
      <div v-if="logs.length === 0" class="log-empty">
        暂无日志
      </div>
      <div
        v-for="log in logs"
        :key="log.id"
        class="log-item"
        :class="log.level"
      >
        <span class="log-time">{{ formatTime(log.time) }}</span>
        <span class="log-level">{{ levelIcon(log.level) }}</span>
        <span class="log-msg">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'

export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  time: number
}

const props = defineProps<{
  logs: LogEntry[]
}>()

const isOpen = ref(false)
const logBody = ref<HTMLElement | null>(null)

watch(() => props.logs.length, async () => {
  if (isOpen.value) {
    await nextTick()
    if (logBody.value) logBody.value.scrollTop = logBody.value.scrollHeight
  }
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function levelIcon(level: string): string {
  return { info: 'ℹ️', warn: '⚠️', error: '❌', debug: '🔍' }[level] || 'ℹ️'
}
</script>

<style scoped>
.log-panel {
  position: fixed;
  left: 20px;
  bottom: 20px;
  width: 300px;
  background: rgba(26, 26, 46, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 998;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.log-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.log-title {
  flex: 1;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.log-toggle {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.log-body {
  height: 240px;
  overflow-y: auto;
  padding: 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

.log-body::-webkit-scrollbar {
  width: 4px;
}

.log-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.log-empty {
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  padding: 40px 0;
  font-size: 12px;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 4px;
  line-height: 1.4;
}

.log-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.log-time {
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.log-level {
  flex-shrink: 0;
  font-size: 10px;
}

.log-msg {
  color: rgba(255, 255, 255, 0.8);
  word-break: break-all;
}

.log-item.error .log-msg {
  color: #f5576c;
}

.log-item.warn .log-msg {
  color: #ffc107;
}
</style>
