/**
 * AudioWorklet PCM 处理器
 * 每 400ms 输出一帧 Float32 音频数据
 * 自动适配 AudioContext 采样率
 */

const WINDOW_MS = 400

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(0)
    this.targetSamples = Math.floor(sampleRate * WINDOW_MS / 1000)
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0]

    // 累积样本
    const combined = new Float32Array(this.buffer.length + channelData.length)
    combined.set(this.buffer)
    combined.set(channelData, this.buffer.length)
    this.buffer = combined

    // 达到目标时输出 Float32
    while (this.buffer.length >= this.targetSamples) {
      const slice = this.buffer.slice(0, this.targetSamples)
      this.buffer = this.buffer.slice(this.targetSamples)
      this.port.postMessage(slice.buffer, [slice.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
