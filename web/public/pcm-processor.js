/**
 * AudioWorklet PCM 处理器
 * 捕获音频并按固定时长分片输出 PCM Int16 数据
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(0)
    // 400ms @ 16kHz = 6400 samples
    this.chunkSize = 6400
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0] // mono

    // 追加到缓冲区
    const newBuffer = new Float32Array(this.buffer.length + channelData.length)
    newBuffer.set(this.buffer)
    newBuffer.set(channelData, this.buffer.length)
    this.buffer = newBuffer

    // 缓冲区达到 chunkSize 时输出
    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.slice(0, this.chunkSize)
      this.buffer = this.buffer.slice(this.chunkSize)

      // Float32 → Int16
      const int16 = new Int16Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      // 发送 Int16 ArrayBuffer
      this.port.postMessage(int16.buffer, [int16.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
