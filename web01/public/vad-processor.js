/**
 * VAD (Voice Activity Detection) AudioWorklet
 *
 * 能量检测 → 只有人声才发音频包，静音不发送
 * 节省 70%+ 带宽和 ASR 费用
 *
 * 输出消息类型:
 *   { type: 'speech_start' }              — 检测到人声开始
 *   { type: 'audio', data: Float32Array } — 人声音频帧（原始采样率）
 *   { type: 'speech_end' }                — 人声结束（静音 1.5秒后）
 */

class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.speaking = false
    this.silenceFrames = 0
    this.energyThreshold = 0.02    // 提高阈值，过滤环境噪音
    // hangover 时间 1.5秒，避免中文说话中途被截断
    // 48kHz / 128 samples = 375 帧/秒，1.5秒 = 563帧
    this.hangoverFrames = 563      // 静音后继续发 1.5秒
    this.frameCount = 0
    this.debugSent = false
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0]
    this.frameCount++

    // 前 3 帧发调试信息
    if (this.frameCount <= 3) {
      this.port.postMessage({ type: 'debug', msg: `frame #${this.frameCount}, samples=${channelData.length}` })
    }

    // 计算 RMS 能量
    let sum = 0
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i]
    }
    const rms = Math.sqrt(sum / channelData.length)

    // 每 500 帧发一次 RMS 调试
    if (this.frameCount % 500 === 0) {
      this.port.postMessage({ type: 'debug', msg: `frame #${this.frameCount}, rms=${rms.toFixed(6)}, speaking=${this.speaking}` })
    }

    if (rms > this.energyThreshold) {
      // ── 检测到人声 ──
      if (!this.speaking) {
        this.speaking = true
        this.port.postMessage({ type: 'speech_start' })
      }
      this.silenceFrames = 0
      this.port.postMessage({ type: 'audio', data: channelData.slice() })
    } else if (this.speaking) {
      // ── 人声后的静音（hangover 保护尾音）──
      this.silenceFrames++
      if (this.silenceFrames < this.hangoverFrames) {
        this.port.postMessage({ type: 'audio', data: channelData.slice() })
      } else {
        // 确认说完
        this.speaking = false
        this.silenceFrames = 0
        this.port.postMessage({ type: 'speech_end' })
      }
    }
    // 纯静音：什么都不发

    return true
  }
}

registerProcessor('vad-processor', VADProcessor)
