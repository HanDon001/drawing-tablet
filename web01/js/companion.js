/**
 * VC.Companion — AI 陪伴模式（简化版）
 *
 * 麦克风一直开着 → 音频持续发给 ASR → ASR 出结果 → LLM 处理 → TTS 播报
 * 服务端 VAD 自动检测语音，不需要客户端 VAD
 */

(function() {
    'use strict';

    const STATE = { IDLE: 'idle', LISTENING: 'listening', PROCESSING: 'processing', SPEAKING: 'speaking', PROACTIVE: 'proactive' }
    const PROACTIVE_TIMEOUT = 20000
    const LISTENING_TIMEOUT = 10000  // LISTENING 状态超时时间

    let state = STATE.IDLE
    let proactiveTimer = null
    let listeningTimer = null
    let currentAudio = null
    let ws = null
    let audioCtx = null
    let workletNode = null
    let mediaStream = null

    // 回调
    let onPartial = null
    let onFinal = null
    let onActions = null
    let onReply = null
    let onStateChange = null

    function setState(newState) {
        const old = state
        state = newState
        console.log(`[Companion] ${old} → ${newState}`)
        if (onStateChange) onStateChange(newState, old)
    }

    // ── 音频缓冲 + 发送 ──
    // vad-processor 每帧发 128 samples，需要攒够再发，避免海量小包
    // 方案B：前端采集 → 降采样到 16kHz → 发送给 DashScope ASR
    const TARGET_SAMPLE_RATE = 16000  // DashScope ASR 期望 16kHz
    let actualSampleRate = 48000      // 实际采样率，启动时更新
    let audioBuffer = []              // Float32 帧缓冲（已降采样）
    let audioBufferSamples = 0        // 缓冲中的总采样数
    const CHUNK_SAMPLES = 8000        // 目标采样率下的缓冲大小（500ms @ 16kHz）
    let audioSendCount = 0

    // 降采样函数：srcRate → dstRate
    function downsample(float32Array, srcRate, dstRate) {
        if (srcRate === dstRate) return float32Array
        const ratio = srcRate / dstRate
        const newLength = Math.round(float32Array.length / ratio)
        const result = new Float32Array(newLength)
        for (let i = 0; i < newLength; i++) {
            const srcIdx = i * ratio
            const idx = Math.floor(srcIdx)
            const frac = srcIdx - idx
            result[i] = idx + 1 < float32Array.length
                ? float32Array[idx] * (1 - frac) + float32Array[idx + 1] * frac
                : float32Array[idx]
        }
        return result
    }

    function handleAudio(float32Array) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        if (state === STATE.SPEAKING) return // 播报时不发音频，防回声

        // 降采样到 16kHz
        const resampled = downsample(float32Array, actualSampleRate, TARGET_SAMPLE_RATE)

        // 攒缓冲
        audioBuffer.push(resampled)
        audioBufferSamples += resampled.length

        // 攒够了才发（CHUNK_SAMPLES 基于目标采样率 16kHz）
        if (audioBufferSamples >= CHUNK_SAMPLES) {
            // 合并
            const merged = new Float32Array(audioBufferSamples)
            let offset = 0
            for (const chunk of audioBuffer) {
                merged.set(chunk, offset)
                offset += chunk.length
            }
            audioBuffer = []
            audioBufferSamples = 0

            // Float32 → Int16（带削波保护）
            const int16 = new Int16Array(merged.length)
            for (let i = 0; i < merged.length; i++) {
                const s = Math.max(-1, Math.min(1, merged[i]))
                int16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
            }
            ws.send(int16.buffer)
            audioSendCount++
            if (audioSendCount % 10 === 1) {
                console.log(`[Companion] 📤 已发送 ${audioSendCount} 块音频 (${int16.length} samples @ ${TARGET_SAMPLE_RATE}Hz)`)
            }
        }
    }

    // ── 后端消息处理 ──
    function handleMessage(msg) {
        switch (msg.type) {
            case 'partial':
                // 修复1: 收到用户语音时清除主动搭话定时器
                clearProactiveTimer()
                // 修复3: SPEAKING 和 PROCESSING 时忽略过期的 partial
                if (state === STATE.SPEAKING || state === STATE.PROCESSING) {
                    console.log(`[Companion] 忽略过期 partial (当前状态: ${state})`)
                    break
                }
                // 进入 LISTENING 状态，重置超时定时器
                if (state !== STATE.LISTENING) {
                    setState(STATE.LISTENING)
                    startListeningTimeout()
                }
                if (onPartial) onPartial(msg.text)
                break

            case 'final':
                // 修复1: 收到用户语音时清除主动搭话定时器
                clearProactiveTimer()
                clearListeningTimeout()
                // 修复3: SPEAKING 时忽略过期的 final
                if (state === STATE.SPEAKING) {
                    console.log(`[Companion] 忽略过期 final (当前状态: ${state})`)
                    break
                }
                if (onFinal) onFinal(msg.text)
                setState(STATE.PROCESSING)
                break

            case 'actions':
                if (onActions) onActions(msg.actions || [])
                break

            case 'reply':
            case 'proactive_reply':
                clearListeningTimeout()
                if (onReply) onReply(msg.text)
                setState(STATE.SPEAKING)
                speakText(msg.text)
                break

            case 'status':
                if (msg.state === 'listening') {
                    clearListeningTimeout()
                    setState(STATE.IDLE)
                }
                break

            case 'error':
                console.error(`[Companion] 错误: ${msg.message}`)
                clearListeningTimeout()
                setState(STATE.IDLE)
                break
        }
    }

    // ── TTS ──
    async function speakText(text) {
        let speakEndCalled = false
        const safeOnSpeakEnd = () => {
            if (speakEndCalled) return
            speakEndCalled = true
            onSpeakEnd()
        }

        try {
            const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: 'Chloe' })
            })
            if (resp.ok) {
                const blob = await resp.blob()
                const url = URL.createObjectURL(blob)
                currentAudio = new Audio(url)
                return new Promise((resolve) => {
                    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; safeOnSpeakEnd(); resolve() }
                    currentAudio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; safeOnSpeakEnd(); resolve() }
                    currentAudio.play().catch(() => { currentAudio = null; safeOnSpeakEnd(); resolve() })
                })
            }
        } catch (e) {
            console.warn('[Companion] TTS 失败:', e)
        }
        // 降级
        return new Promise((resolve) => {
            const u = new SpeechSynthesisUtterance(text)
            u.lang = 'zh-CN'; u.rate = 0.9
            u.onend = () => { safeOnSpeakEnd(); resolve() }
            u.onerror = () => { safeOnSpeakEnd(); resolve() }
            speechSynthesis.speak(u)
        })
    }

    function onSpeakEnd() {
        setState(STATE.IDLE)
        startProactiveTimer()
    }

    function stopCurrentAudio() {
        if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null }
        speechSynthesis.cancel()
    }

    // ── 主动搭话 ──
    function startProactiveTimer() {
        clearProactiveTimer()
        proactiveTimer = setTimeout(() => {
            if (state === STATE.IDLE) {
                setState(STATE.PROACTIVE)
                sendJSON({ action: 'proactive' })
            }
        }, PROACTIVE_TIMEOUT)
    }
    function clearProactiveTimer() {
        if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null }
    }

    // ── LISTENING 超时 ──
    // 修复2: 防止 VAD 误判导致状态机卡在 LISTENING
    function startListeningTimeout() {
        clearListeningTimeout()
        listeningTimer = setTimeout(() => {
            if (state === STATE.LISTENING) {
                console.warn('[Companion] LISTENING 超时，回退到 IDLE')
                setState(STATE.IDLE)
            }
        }, LISTENING_TIMEOUT)
    }
    function clearListeningTimeout() {
        if (listeningTimer) { clearTimeout(listeningTimer); listeningTimer = null }
    }

    // ── WebSocket ──
    function sendJSON(obj) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
    }

    function connectWS() {
        return new Promise((resolve, reject) => {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
            ws = new WebSocket(`${protocol}//${location.host}/ai/v1/gateway`)
            ws.binaryType = 'arraybuffer'
            ws.onopen = () => { console.log('[Companion] WS 已连接'); resolve() }
            ws.onerror = (e) => { console.error('[Companion] WS 错误'); reject(e) }
            ws.onmessage = (e) => {
                if (e.data instanceof ArrayBuffer) return
                try { handleMessage(JSON.parse(e.data)) } catch {}
            }
            ws.onclose = (e) => console.log(`[Companion] WS 关闭: ${e.code}`)
        })
    }

    // ── 麦克风 + 音频流 ──
    let isSpeaking = false  // VAD检测到人声

    async function startMic() {
        console.log('[Companion] 请求麦克风...')
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        console.log('[Companion] 麦克风已获取')

        // 尝试使用 16kHz，如果不支持则使用默认采样率
        try {
            audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
        } catch (e) {
            console.warn('[Companion] 不支持 16kHz，使用默认采样率')
            audioCtx = new AudioContext()
        }
        actualSampleRate = audioCtx.sampleRate
        console.log(`[Companion] AudioContext: ${actualSampleRate}Hz (目标: ${TARGET_SAMPLE_RATE}Hz)`)

        if (audioCtx.state === 'suspended') await audioCtx.resume()

        // 用 vad-processor 检测人声，只有人声才发送音频
        await audioCtx.audioWorklet.addModule('/vad-processor.js')
        const source = audioCtx.createMediaStreamSource(mediaStream)
        workletNode = new AudioWorkletNode(audioCtx, 'vad-processor')

        workletNode.port.onmessage = (e) => {
            const msg = e.data
            switch (msg.type) {
                case 'speech_start':
                    isSpeaking = true
                    console.log('[Companion] VAD: 检测到人声')
                    break
                case 'audio':
                    if (isSpeaking) {
                        handleAudio(msg.data)
                    }
                    break
                case 'speech_end':
                    isSpeaking = false
                    console.log('[Companion] VAD: 人声结束')
                    // 发送缓冲区中剩余的音频（已降采样）
                    if (audioBuffer.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
                        const merged = new Float32Array(audioBufferSamples)
                        let offset = 0
                        for (const chunk of audioBuffer) {
                            merged.set(chunk, offset)
                            offset += chunk.length
                        }
                        audioBuffer = []
                        audioBufferSamples = 0
                        // Float32 → Int16（带削波保护）
                        const int16 = new Int16Array(merged.length)
                        for (let i = 0; i < merged.length; i++) {
                            const s = Math.max(-1, Math.min(1, merged[i]))
                            int16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
                        }
                        ws.send(int16.buffer)
                        console.log(`[Companion] 📤 flush 尾音 ${int16.length} samples @ ${TARGET_SAMPLE_RATE}Hz`)
                    }
                    // 通知后端语音结束，触发ASR识别
                    sendJSON({ action: 'speech_end' })
                    break
            }
        }

        source.connect(workletNode)
        console.log('[Companion] 音频管道已建立，VAD检测中...')
    }

    function stopMic() {
        if (workletNode) { workletNode.disconnect(); workletNode = null }
        if (audioCtx) { audioCtx.close(); audioCtx = null }
        if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null }
    }

    // ── 公开 API ──
    VC.Companion = {
        STATE,

        async start(callbacks = {}) {
            onPartial = callbacks.onPartial || (() => {})
            onFinal = callbacks.onFinal || (() => {})
            onActions = callbacks.onActions || (() => {})
            onReply = callbacks.onReply || (() => {})
            onStateChange = callbacks.onStateChange || (() => {})

            console.log('[Companion] 启动陪伴模式...')
            try {
                await connectWS()
                console.log('[Companion] WebSocket 连接成功')
            } catch (e) {
                console.error('[Companion] WebSocket 连接失败:', e)
                throw e
            }
            try {
                await startMic()
                console.log('[Companion] 麦克风启动成功')
            } catch (e) {
                console.error('[Companion] 麦克风启动失败:', e)
                throw e
            }
            setState(STATE.IDLE)
            startProactiveTimer()
            console.log('[Companion] 陪伴模式已启动，持续监听中')
        },

        stop() {
            console.log('[Companion] 停止陪伴模式')
            clearProactiveTimer()
            clearListeningTimeout()
            stopCurrentAudio()
            stopMic()
            if (ws) { sendJSON({ action: 'stop' }); ws.close(); ws = null }
            setState(STATE.IDLE)
        },

        sendText(text) {
            const SHAPE_NAMES = { circle: '圆形', rectangle: '矩形', triangle: '三角形', line: '直线', star: '星形', diamond: '菱形', arrow: '箭头', hexagon: '六边形' }
            const POS_NAMES = { center: '中间', left_top: '左上角', top: '上方', right_top: '右上角', left: '左边', right: '右边', left_bottom: '左下角', bottom: '下方', right_bottom: '右下角' }
            const objs = VC.State.objects || []
            const canvasSize = (VC.Canvas && VC.Canvas.getSize) ? VC.Canvas.getSize() : { width: 800, height: 600 }
            const ctx = objs.length === 0 ? '画布为空' : objs.map(o => {
                const shape = SHAPE_NAMES[o.shape] || o.shape
                const tag = o.tag ? `，叫"${o.tag}"` : ''
                // 优先使用坐标描述位置
                let posDesc
                if (o.x !== undefined && o.y !== undefined) {
                    posDesc = `坐标(${o.x.toFixed(2)},${o.y.toFixed(2)})`
                } else {
                    posDesc = POS_NAMES[o.position] || o.position
                }
                return `${posDesc}有${o.color}${shape}${tag}`
            }).join('；')
            const canvasInfo = `画布尺寸:${canvasSize.width}x${canvasSize.height}px，坐标系x(0-1)y(0-1)`
            sendJSON({ action: 'text', text, canvas_context: `${canvasInfo}；${ctx}` })
        },

        getState() { return state }
    }

    console.log('[Companion] 模块加载完成')
})()
