/**
 * 语音服务组合式函数
 * 使用小米 MiMo ASR/TTS API
 */

import { ref, onUnmounted } from 'vue'
import { speechToText, textToSpeech } from '@/api'
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

  // MediaRecorder 实例
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let stream: MediaStream | null = null

  /**
   * 初始化录音器
   */
  async function initRecorder(): Promise<boolean> {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        logger.info('录音结束，开始识别...')
        asrState.value = 'processing'

        try {
          // 合并音频数据
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
          audioChunks = []

          // 转换为 Base64
          const base64Audio = await blobToBase64(audioBlob)

          // 调用 ASR API
          const result = await speechToText({
            audio_data: base64Audio,
            mime_type: 'audio/webm',
            language: 'auto'
          })

          if (result.text) {
            // 添加时间戳确保唯一性
            transcript.value = `${result.text}__${Date.now()}`
            logger.info('ASR 识别结果:', result.text)
          }
        } catch (error) {
          logger.error('ASR 识别失败:', error)
        } finally {
          asrState.value = 'idle'
        }
      }

      return true
    } catch (error) {
      logger.error('初始化录音器失败:', error)
      return false
    }
  }

  /**
   * Blob 转 Base64
   */
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * 开始语音识别
   */
  async function startListening(): Promise<void> {
    if (!mediaRecorder) {
      const success = await initRecorder()
      if (!success) return
    }

    transcript.value = ''
    audioChunks = []

    try {
      mediaRecorder!.start()
      asrState.value = 'listening'
      logger.info('开始录音...')
    } catch (error) {
      logger.error('开始录音失败:', error)
    }
  }

  /**
   * 停止语音识别
   */
  function stopListening(): void {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
      logger.info('停止录音')
    }
  }

  /**
   * TTS 语音播报
   * 使用小米 MiMo TTS API
   */
  async function speak(text: string): Promise<void> {
    try {
      logger.info('TTS 播报:', text)

      // 调用 TTS API
      const audioBlob = await textToSpeech({
        text,
        voice: 'Chloe',
        style: 'Bright, bouncy, slightly sing-song tone'
      })

      // 播放音频
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          logger.info('TTS 播报完成')
          resolve()
        }

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl)
          logger.error('TTS 播放失败:', error)
          reject(error)
        }

        audio.play().catch(reject)
      })
    } catch (error) {
      logger.error('TTS 请求失败:', error)
      // 降级到浏览器原生 TTS
      await speakFallback(text)
    }
  }

  /**
   * 降级 TTS（浏览器原生）
   */
  function speakFallback(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('浏览器不支持 TTS'))
        return
      }

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = 1.0
      utterance.pitch = 1.0

      utterance.onend = () => resolve()
      utterance.onerror = reject

      window.speechSynthesis.speak(utterance)
    })
  }

  /**
   * 快通道指令检测
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

  // 清理资源
  onUnmounted(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
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
