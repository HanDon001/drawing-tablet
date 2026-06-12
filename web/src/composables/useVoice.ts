/**
 * 实时流式语音识别组合式函数
 *
 * 流程:
 * AudioContext(16kHz) → AudioWorklet(400ms PCM) → WebSocket → DashScope ASR Realtime
 *   ↓
 * 增量结果 → 2500ms 防抖 → 分块策略 → ADD_TEMP
 * 最终结果 → 立即 MARK_FINAL → 800ms 冷却 → contextHistory
 */

import { ref, onUnmounted } from 'vue'
import { textToSpeech } from '@/api'
import { logger } from '@/utils/logger'

export type AsrState = 'idle' | 'listening' | 'processing'

export function useVoice() {
  const asrState = ref<AsrState>('idle')
  const transcript = ref('')

  // 音频捕获
  let audioCtx: AudioContext | null = null
  let workletNode: AudioWorkletNode | null = null
  let mediaStream: MediaStream | null = null

  // WebSocket
  let ws: WebSocket | null = null

  // 防抖 & 分块
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastPartialText = ''
  let contextHistory: string[] = [] // 最近 2 句最终结果
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null
  let isCoolingDown = false

  const DEBOUNCE_MS = 2500
  const COOLDOWN_MS = 800
  const MAX_CONTEXT = 2

  // ========== 分块策略 ==========

  function shouldChunk(text: string): boolean {
    // 标点触发
    if (/[，。！？、；：,.!?;:]/.test(text)) return true
    // 20 词触发
    if (text.split(/\s+/).length >= 20) return true
    return false
  }

  // ========== 结果处理 ==========

  function handlePartialResult(text: string) {
    if (isCoolingDown) return
    lastPartialText = text

    // 清除旧防抖
    if (debounceTimer) clearTimeout(debounceTimer)

    // 分块策略判断
    if (shouldChunk(text)) {
      flushPartial(text)
      return
    }

    // 2500ms 防抖
    debounceTimer = setTimeout(() => {
      flushPartial(lastPartialText)
    }, DEBOUNCE_MS)
  }

  function flushPartial(text: string) {
    if (!text.trim()) return
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    emitTranscript(text, false)
  }

  function handleFinalResult(text: string) {
    // 清除防抖
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    // 立即发送最终结果
    emitTranscript(text, true)

    // 加入上下文
    contextHistory.push(text)
    if (contextHistory.length > MAX_CONTEXT) {
      contextHistory.shift()
    }

    // 800ms 冷却期
    isCoolingDown = true
    if (cooldownTimer) clearTimeout(cooldownTimer)
    cooldownTimer = setTimeout(() => {
      isCoolingDown = false
    }, COOLDOWN_MS)
  }

  function emitTranscript(text: string, isFinal: boolean) {
    const ts = Date.now()
    transcript.value = `${text}__${ts}__${isFinal ? 'final' : 'temp'}`
    logger.info(`ASR ${isFinal ? '最终' : '增量'}: ${text}`)
  }

  // ========== WebSocket ==========

  function connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${location.host}/ai/v1/voice/asr/ws`

      const socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        logger.info('ASR WebSocket 已连接')
        resolve(socket)
      }

      socket.onerror = (e) => {
        logger.error('ASR WebSocket 错误:', e)
        reject(new Error('WebSocket 连接失败'))
      }

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          switch (msg.type) {
            case 'status':
              logger.info('ASR 状态:', msg.status)
              if (msg.status === 'started') {
                asrState.value = 'listening'
              }
              break

            case 'result':
              if (msg.is_final) {
                handleFinalResult(msg.text)
              } else {
                handlePartialResult(msg.text)
              }
              break

            case 'error':
              logger.error('ASR 错误:', msg.message)
              break
          }
        } catch {
          // 忽略非 JSON 消息
        }
      }

      socket.onclose = () => {
        logger.info('ASR WebSocket 已关闭')
      }
    })
  }

  // ========== 音频捕获 ==========

  async function startAudioCapture(): Promise<boolean> {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })

      audioCtx = new AudioContext({ sampleRate: 16000 })

      // 加载 AudioWorklet
      await audioCtx.audioWorklet.addModule('/pcm-processor.js')

      const source = audioCtx.createMediaStreamSource(mediaStream)
      workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor')

      // 接收 PCM 分片 → 发送到 WebSocket
      workletNode.port.onmessage = (event) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(event.data) // Int16 ArrayBuffer
        }
      }

      source.connect(workletNode)
      workletNode.connect(audioCtx.destination)

      logger.info('音频捕获已启动 (16kHz, 400ms chunks)')
      return true
    } catch (err) {
      logger.error('音频捕获初始化失败:', err)
      return false
    }
  }

  function stopAudioCapture() {
    workletNode?.disconnect()
    workletNode = null

    audioCtx?.close()
    audioCtx = null

    mediaStream?.getTracks().forEach(t => t.stop())
    mediaStream = null
  }

  // ========== 公开方法 ==========

  async function startListening(): Promise<void> {
    transcript.value = ''
    lastPartialText = ''
    contextHistory = []

    try {
      // 1. 连接 WebSocket
      ws = await connectWebSocket()

      // 2. 启动音频捕获
      const ok = await startAudioCapture()
      if (!ok) {
        ws.close()
        ws = null
        return
      }

      // 3. 发送 start 指令
      ws.send(JSON.stringify({
        action: 'start',
        task_id: `asr-${Date.now()}`,
        config: {
          parameters: {
            format: 'pcm',
            sample_rate: 16000,
          }
        }
      }))

      asrState.value = 'listening'
      logger.info('实时 ASR 已启动')
    } catch (err) {
      logger.error('启动 ASR 失败:', err)
      asrState.value = 'idle'
    }
  }

  function stopListening(): void {
    if (asrState.value !== 'listening') return

    // 1. 发送 stop 指令
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'stop' }))
    }

    // 2. 停止音频捕获
    stopAudioCapture()

    // 3. 清理防抖
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (cooldownTimer) {
      clearTimeout(cooldownTimer)
      cooldownTimer = null
    }

    // 4. 如果有未发送的增量结果，立即发送
    if (lastPartialText.trim()) {
      emitTranscript(lastPartialText, true)
    }

    asrState.value = 'idle'
    logger.info('实时 ASR 已停止')
  }

  async function speak(text: string): Promise<void> {
    try {
      const audioBlob = await textToSpeech({ text, voice: 'Chloe' })
      const url = URL.createObjectURL(audioBlob)
      const audio = new Audio(url)
      return new Promise((resolve, reject) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve() }
        audio.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
        audio.play().catch(reject)
      })
    } catch {
      await speakFallback(text)
    }
  }

  function speakFallback(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) { reject(new Error('不支持TTS')); return }
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.onend = () => resolve()
      u.onerror = reject
      window.speechSynthesis.speak(u)
    })
  }

  function detectFastCommand(text: string): string | null {
    const cmds: Record<string, string[]> = {
      undo: ['撤销', '撤回', '取消'],
      clear: ['清空', '清除', '全部删除'],
      stop: ['停止', '停', '安静']
    }
    for (const [action, kws] of Object.entries(cmds)) {
      if (kws.some(k => text.includes(k))) return action
    }
    return null
  }

  // 清理
  onUnmounted(() => {
    stopListening()
    ws?.close()
  })

  return {
    asrState,
    transcript,
    startListening,
    stopListening,
    speak,
    detectFastCommand,
  }
}
