/**
 * 语音服务组合式函数
 * 封装 ASR (语音识别) 和 TTS (语音合成)
 */

import { ref, onUnmounted } from 'vue'
import { config } from '@/config'
import { logger } from '@/utils/logger'

// ASR 状态
export type AsrState = 'idle' | 'listening' | 'processing'

/**
 * 语音服务组合式函数
 */
export function useVoice() {
  // ASR 状态
  const asrState = ref<AsrState>('idle')
  const transcript = ref('')

  // Speech Recognition 实例
  let recognition: any = null

  /**
   * 初始化 ASR
   */
  function initASR(): boolean {
    // 检查浏览器支持
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      logger.error('浏览器不支持 Speech Recognition API')
      return false
    }

    recognition = new SpeechRecognition()
    recognition.lang = config.asrLanguage
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => {
      asrState.value = 'listening'
      logger.info('ASR 开始监听')
    }

    recognition.onresult = (event: any) => {
      const result = event.results[0][0].transcript
      // 添加时间戳确保每次识别都是唯一的值
      transcript.value = `${result}__${Date.now()}`
      logger.info('ASR 识别结果:', result)
    }

    recognition.onerror = (event: any) => {
      logger.error('ASR 错误:', event.error)
      asrState.value = 'idle'
    }

    recognition.onend = () => {
      asrState.value = 'idle'
      logger.info('ASR 结束监听')
    }

    return true
  }

  /**
   * 开始语音识别
   */
  function startListening(): void {
    if (!recognition) {
      if (!initASR()) return
    }

    transcript.value = ''
    recognition.start()
  }

  /**
   * 停止语音识别
   */
  function stopListening(): void {
    if (recognition) {
      recognition.stop()
    }
  }

  /**
   * TTS 语音播报
   */
  function speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        logger.error('浏览器不支持 Speech Synthesis API')
        reject(new Error('不支持TTS'))
        return
      }

      // 取消之前的播报
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = config.asrLanguage
      utterance.rate = 1.0
      utterance.pitch = 1.0

      // 尝试查找指定声音
      const voices = window.speechSynthesis.getVoices()
      const targetVoice = voices.find(v => v.name.includes(config.ttsVoiceName))
      if (targetVoice) {
        utterance.voice = targetVoice
      }

      utterance.onend = () => {
        logger.info('TTS 播报完成:', text)
        resolve()
      }

      utterance.onerror = (event) => {
        logger.error('TTS 错误:', event)
        reject(event)
      }

      window.speechSynthesis.speak(utterance)
    })
  }

  /**
   * 快通道指令检测
   * 检测是否为本地可处理的简单指令
   */
  function detectFastCommand(text: string): string | null {
    const commands: Record<string, string[]> = {
      'undo': ['撤销', '撤回', '取消'],
      'clear': ['清空', '清除', '全部删除'],
      'stop': ['停止', '停', '安静']
    }

    for (const [action, keywords] of Object.entries(commands)) {
      if (keywords.some(kw => text.includes(kw))) {
        return action
      }
    }

    return null
  }

  // 组件卸载时清理
  onUnmounted(() => {
    if (recognition) {
      recognition.abort()
    }
    window.speechSynthesis.cancel()
  })

  return {
    // 状态
    asrState,
    transcript,

    // 方法
    startListening,
    stopListening,
    speak,
    detectFastCommand
  }
}
