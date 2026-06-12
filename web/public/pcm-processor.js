/**
 * AudioWorklet PCM 处理器
 * 10ms 分片 @ 16kHz = 160 samples/帧
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(0)
    this.frameSize = 160 // 10ms @ 16kHz
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0]

    // 追加到缓冲区
    const newBuffer = new Float32Array(this.buffer.length + channelData.length)
    newBuffer.set(this.buffer)
    newBuffer.set(channelData, this.buffer.length)
    this.buffer = newBuffer

    // 凑满 1 帧就发
    while (this.buffer.length >= this.frameSize) {
      const chunk = this.buffer.slice(0, this.frameSize)
      this.buffer = this.buffer.slice(this.frameSize)

      // Float32 → Int16
      const int16 = new Int16Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      this.port.postMessage(int16.buffer, [int16.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
