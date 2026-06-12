/**
 * 实时流式语音识别组合式函数
 *
 * 特性:
 * - Barge-in: 用户说话时立即打断 TTS
 * - 预判执行: 快指令不等 final 直接执行
 * - VAD 语音活动检测
 * - WebSocket 自动重连 + HTTP 降级
 */

import { ref, onUnmounted } from 'vue'
import { textToSpeech, speechToText } from '@/api'
import { logger } from '@/utils/logger'

export type AsrState = 'idle' | 'listening' | 'processing'

export function useVoice() {
  const asrState = ref<AsrState>('idle')
  const transcript = ref('')

  // 音频捕获
  let audioCtx: AudioContext | null = null
  let workletNode: AudioWorkletNode | null = null
  let mediaStream: MediaStream | null = null

  // WebSocket 重连
  let ws: WebSocket | null = null
  let retryCount = 0
  const MAX_RETRIES = 5
  const BACKOFF_MS = 1000
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Barge-in 打断
  let currentAudio: HTMLAudioElement | null = null
  let isSpeaking = false
  const audioQueue: string[] = []

  // 预判
  let lastPartialHandled = false

  // 防抖 & 分块
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let lastPartialText = ''
  let contextHistory: string[] = []
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null
  let isCoolingDown = false

  const DEBOUNCE_MS = 800
  const COOLDOWN_MS = 800
  const MAX_CONTEXT = 2

  // ========== Barge-in 打断 ==========

  function onSpeechDetected() {
    if (isSpeaking) {
      logger.info('Barge-in: 用户打断，停止 TTS')
      currentAudio?.pause()
      currentAudio = null
      isSpeaking = false
      audioQueue.length = 0 // 清空排队音频
      window.speechSynthesis?.cancel()
    }
  }

  // ========== 预判执行 ==========

  function onASRPartial(text: string): boolean {
    const trimmed = text.trim()

    // 高置信度快指令预判：不等 is_final 直接执行
    if (/^(撤销|撤回|取消)$/.test(trimmed)) {
      logger.info('预判执行: 撤销')
      lastPartialHandled = true
      return true
    }
    if (/^(清空|清除|全部删除)$/.test(trimmed)) {
      logger.info('预判执行: 清空')
      lastPartialHandled = true
      return true
    }
    if (/^(停止|停|安静)$/.test(trimmed)) {
      logger.info('预判执行: 停止')
      lastPartialHandled = true
      return true
    }

    return false
  }

  // ========== 分块策略 ==========

  function shouldChunk(text: string): boolean {
    if (/[。！？；，]/.test(text)) return true
    if (text.split(/\s+/).length >= 10) return true
    return false
  }

  // ========== 结果处理 ==========

  function handlePartialResult(text: string) {
    if (isCoolingDown) return
    lastPartialText = text
    lastPartialHandled = false

    // 预判执行
    onASRPartial(text)

    if (debounceTimer) clearTimeout(debounceTimer)

    if (shouldChunk(text)) {
      flushPartial(text)
      return
    }

    debounceTimer = setTimeout(() => {
      flushPartial(lastPartialText)
    }, DEBOUNCE_MS)
  }

  function flushPartial(text: string) {
    if (!text.trim()) return
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    emitTranscript(text, false)
  }

  function handleFinalResult(text: string) {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }

    // 如果预判已处理过，跳过最终结果的重复执行
    if (lastPartialHandled) {
      logger.info('预判已处理，跳过最终结果')
      lastPartialHandled = false
      emitTranscript(text, true) // 仍然发送到 UI，但标记为已处理
      return
    }

    emitTranscript(text, true)

    contextHistory.push(text)
    if (contextHistory.length > MAX_CONTEXT) contextHistory.shift()

    isCoolingDown = true
    if (cooldownTimer) clearTimeout(cooldownTimer)
    cooldownTimer = setTimeout(() => { isCoolingDown = false }, COOLDOWN_MS)
  }

  function emitTranscript(text: string, isFinal: boolean) {
    transcript.value = `${text}__${Date.now()}__${isFinal ? 'final' : 'temp'}`
    logger.info(`ASR ${isFinal ? '最终' : '增量'}: ${text}`)
  }

  // ========== WebSocket 自动重连 ==========

  function connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${location.host}/ai/v1/voice/asr/ws`

      const socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        logger.info('ASR WebSocket 已连接')
        retryCount = 0
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
              if (msg.status === 'started') asrState.value = 'listening'
              break
            case 'result':
              if (msg.is_final) handleFinalResult(msg.text)
              else handlePartialResult(msg.text)
              break
            case 'error':
              logger.error('ASR 错误:', msg.message)
              break
          }
        } catch { /* 忽略非 JSON */ }
      }

      socket.onclose = (e) => {
        logger.info(`ASR WebSocket 关闭 (code=${e.code})`)
        if (e.code !== 1000 && retryCount < MAX_RETRIES && asrState.value === 'listening') {
          const delay = BACKOFF_MS * Math.pow(2, retryCount)
          logger.warn(`WS 断开，${delay}ms 后重连 (${retryCount + 1}/${MAX_RETRIES})`)
          reconnectTimer = setTimeout(async () => {
            retryCount++
            try {
              ws = await connectWebSocket()
              ws.send(JSON.stringify({ action: 'start', task_id: `asr-${Date.now()}` }))
            } catch {
              fallbackToHttpASR()
            }
          }, delay)
        } else if (asrState.value === 'listening') {
          fallbackToHttpASR()
        }
      }
    })
  }

  // ========== HTTP ASR 降级 ==========

  async function fallbackToHttpASR() {
    logger.warn('降级到 HTTP ASR 模式')
    if (pcmChunks.length === 0) return

    const totalLength = pcmChunks.reduce((s, c) => s + c.length, 0)
    const merged = new Float32Array(totalLength)
    let off = 0
    for (const chunk of pcmChunks) { merged.set(chunk, off); off += chunk.length }
    pcmChunks = []

    const wavBuffer = encodeWAV(merged, audioCtx?.sampleRate || 16000)
    const base64 = arrayBufferToBase64(wavBuffer)

    try {
      const result = await speechToText({ audio_data: base64, mime_type: 'audio/wav', language: 'auto' })
      if (result.text) handleFinalResult(result.text)
    } catch (err) {
      logger.error('HTTP ASR 降级也失败:', err)
    }
  }

  let pcmChunks: Float32Array[] = []

  function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const bps = 16, ch = 1
    const dataSize = samples.length * (bps / 8)
    const buf = new ArrayBuffer(44 + dataSize)
    const v = new DataView(buf)
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
    ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE')
    ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
    v.setUint16(22, ch, true); v.setUint32(24, sampleRate, true)
    v.setUint32(28, sampleRate * ch * bps / 8, true); v.setUint16(32, ch * bps / 8, true)
    v.setUint16(34, bps, true); ws(36, 'data'); v.setUint32(40, dataSize, true)
    let o = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      v.setInt16(o, s * (s < 0 ? 0x8000 : 0x7FFF), true); o += 2
    }
    return buf
  }

  function arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }

  // ========== 音频捕获 (VAD) ==========

  async function startAudioCapture(): Promise<boolean> {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })

      audioCtx = new AudioContext({ sampleRate: 16000 })
      await audioCtx.audioWorklet.addModule('/vad-processor.js')

      const source = audioCtx.createMediaStreamSource(mediaStream)
      workletNode = new AudioWorkletNode(audioCtx, 'vad-processor')

      workletNode.port.onmessage = (event) => {
        const { type, data } = event.data

        if (type === 'audio') {
          // 检测到语音活动 → Barge-in
          onSpeechDetected()

          const int16 = new Int16Array(data)
          if (ws?.readyState === WebSocket.OPEN) ws.send(int16.buffer)
          pcmChunks.push(new Float32Array(data))
        }

        if (type === 'silence') {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'stop' }))
          }
        }
      }

      source.connect(workletNode)
      workletNode.connect(audioCtx.destination)

      logger.info('音频捕获已启动 (VAD + Barge-in)')
      return true
    } catch (err) {
      logger.error('音频捕获初始化失败:', err)
      return false
    }
  }

  function stopAudioCapture() {
    workletNode?.disconnect(); workletNode = null
    audioCtx?.close(); audioCtx = null
    mediaStream?.getTracks().forEach(t => t.stop()); mediaStream = null
  }

  // ========== 公开方法 ==========

  async function startListening(): Promise<void> {
    transcript.value = ''
    lastPartialText = ''
    lastPartialHandled = false
    contextHistory = []
    pcmChunks = []
    retryCount = 0

    try {
      ws = await connectWebSocket()
      const ok = await startAudioCapture()
      if (!ok) { ws.close(); ws = null; return }

      ws.send(JSON.stringify({
        action: 'start',
        task_id: `asr-${Date.now()}`,
        config: { parameters: { format: 'pcm', sample_rate: 16000 } }
      }))

      asrState.value = 'listening'
      logger.info('实时 ASR 已启动 (Barge-in + 预判)')
    } catch (err) {
      logger.error('启动 ASR 失败:', err)
      asrState.value = 'idle'
    }
  }

  function stopListening(): void {
    if (asrState.value !== 'listening') return

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'stop' }))
    }

    stopAudioCapture()

    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null }

    if (lastPartialText.trim()) emitTranscript(lastPartialText, true)

    asrState.value = 'idle'
    logger.info('ASR 已停止')
  }

  async function speak(text: string): Promise<void> {
    // 入队列
    audioQueue.push(text)
    if (!isSpeaking) await drainAudioQueue()
  }

  async function drainAudioQueue() {
    isSpeaking = true
    while (audioQueue.length > 0) {
      const text = audioQueue.shift()!
      try {
        const audioBlob = await textToSpeech({ text, voice: 'Chloe' })
        const url = URL.createObjectURL(audioBlob)
        currentAudio = new Audio(url)

        await new Promise<void>((resolve) => {
          if (!currentAudio) { resolve(); return }
          currentAudio.onended = () => {
            URL.revokeObjectURL(url)
            currentAudio = null
            resolve()
          }
          currentAudio.onerror = () => {
            URL.revokeObjectURL(url)
            currentAudio = null
            resolve()
          }
          currentAudio.play().catch(() => { resolve() })
        })
      } catch {
        // TTS 失败，尝试浏览器原生
        try {
          await speakFallback(text)
        } catch { /* 跳过 */ }
      }
    }
    isSpeaking = false
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

  onUnmounted(() => {
    stopListening()
    ws?.close()
    currentAudio?.pause()
    window.speechSynthesis?.cancel()
  })

  return {
    asrState, transcript,
    startListening, stopListening, speak, detectFastCommand,
    // 多模态反馈用
    onSpeechDetected,
  }
}
