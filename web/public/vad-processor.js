/**
 * VAD (Voice Activity Detection) AudioWorklet
 * 只在检测到语音活动时才发送音频数据
 * 静音时节省 70%+ 带宽和 ASR 费用
 */

class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isSpeech = false
    this.silenceFrames = 0
    this.energyThreshold = 0.01   // RMS 阈值
    this.hangoverFrames = 30      // 尾音保护：静音后继续发 300ms (30 * 10ms)
    this.frameSize = 160          // 10ms @ 16kHz
    this.buffer = new Float32Array(0)
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0]

    // 追加到缓冲区
    const newBuf = new Float32Array(this.buffer.length + channelData.length)
    newBuf.set(this.buffer)
    newBuf.set(channelData, this.buffer.length)
    this.buffer = newBuf

    // 按帧处理
    while (this.buffer.length >= this.frameSize) {
      const frame = this.buffer.slice(0, this.frameSize)
      this.buffer = this.buffer.slice(this.frameSize)

      // 计算 RMS 能量
      let sum = 0
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
      const rms = Math.sqrt(sum / frame.length)

      if (rms > this.energyThreshold) {
        // 检测到语音
        this.isSpeech = true
        this.silenceFrames = 0
        this._sendAudio(frame)
      } else if (this.isSpeech) {
        // 语音中的静音段
        this.silenceFrames++
        if (this.silenceFrames < this.hangoverFrames) {
          this._sendAudio(frame)  // 尾音保护
        } else {
          // 说话结束
          this.isSpeech = false
          this.silenceFrames = 0
          this.port.postMessage({ type: 'silence' })
        }
      }
      // 纯静音时不发送 → 节省带宽
    }

    return true
  }

  _sendAudio(frame) {
    // Float32 → Int16
    const int16 = new Int16Array(frame.length)
    for (let i = 0; i < frame.length; i++) {
      const s = Math.max(-1, Math.min(1, frame[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    this.port.postMessage({ type: 'audio', data: int16.buffer }, [int16.buffer])
  }
}

registerProcessor('vad-processor', VADProcessor)
