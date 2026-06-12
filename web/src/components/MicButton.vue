<template>
  <button
    class="mic-button"
    :class="{ 'is-listening': isListening, 'is-loading': isLoading }"
    @click="handleClick"
    :disabled="isLoading"
    :aria-label="isListening ? '正在聆听...' : '点击开始语音'"
  >
    <span class="mic-icon">
      <svg v-if="!isListening && !isLoading" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
      <svg v-else-if="isListening" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="8" class="pulse-circle"/>
      </svg>
      <span v-else class="loading-spinner"></span>
    </span>
    <span class="mic-text">
      {{ isListening ? '聆听中...' : isLoading ? '处理中...' : '按住说话' }}
    </span>
  </button>
</template>

<script setup lang="ts">
interface Props {
  isListening?: boolean
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isListening: false,
  isLoading: false
})

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  if (!props.isLoading) {
    emit('click')
  }
}
</script>

<style scoped>
.mic-button {
  position: fixed;
  bottom: 32px;
  right: 360px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  z-index: 1000;
}

.mic-button:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.mic-button:active:not(:disabled) {
  transform: scale(0.95);
}

.mic-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.mic-button.is-listening {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  animation: pulse 1.5s infinite;
}

.mic-icon {
  width: 28px;
  height: 28px;
  color: white;
}

.mic-icon svg {
  width: 100%;
  height: 100%;
}

.mic-text {
  font-size: 10px;
  color: white;
  white-space: nowrap;
}

.pulse-circle {
  animation: pulse-scale 1s infinite;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
  }
  50% {
    box-shadow: 0 4px 25px rgba(245, 87, 108, 0.8);
  }
}

@keyframes pulse-scale {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.8;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
