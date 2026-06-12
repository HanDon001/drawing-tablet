/**
 * 语音状态机 (VoiceFSM)
 * 清晰管理语音交互的 5 种状态与合法转换
 *
 * idle → listening → processing → speaking → idle
 *                    ↓ (error) → idle
 * speaking → listening (barge-in)
 */

import { ref, readonly } from 'vue'
import { logger } from '@/utils/logger'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

// 合法状态转换表
const TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  idle:       ['listening'],
  listening:  ['processing', 'idle'],
  processing: ['speaking', 'idle', 'error'],
  speaking:   ['listening', 'idle'],
  error:      ['idle'],
}

export interface VoiceFSMOptions {
  onEnterListening?: () => void
  onEnterProcessing?: () => void
  onEnterSpeaking?: () => void
  onEnterIdle?: () => void
  onError?: (msg: string) => void
}

export function createVoiceFSM(options: VoiceFSMOptions = {}) {
  const state = ref<VoiceState>('idle')

  function transition(to: VoiceState): boolean {
    const allowed = TRANSITIONS[state.value]
    if (!allowed.includes(to)) {
      logger.warn(`VoiceFSM 非法转换: ${state.value} → ${to}`)
      return false
    }

    logger.info(`VoiceFSM: ${state.value} → ${to}`)
    onExit(state.value)
    state.value = to
    onEnter(to)
    return true
  }

  function onEnter(s: VoiceState) {
    switch (s) {
      case 'listening':
        options.onEnterListening?.()
        break
      case 'processing':
        options.onEnterProcessing?.()
        break
      case 'speaking':
        options.onEnterSpeaking?.()
        break
      case 'idle':
        options.onEnterIdle?.()
        break
      case 'error':
        options.onError?.('语音处理出错')
        break
    }
  }

  function onExit(s: VoiceState) {
    // 预留：退出状态时的清理逻辑
    void s
  }

  function canTransitionTo(to: VoiceState): boolean {
    return TRANSITIONS[state.value].includes(to)
  }

  function reset() {
    state.value = 'idle'
  }

  return {
    state: readonly(state),
    transition,
    canTransitionTo,
    reset,
  }
}
