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
    let destroyed = false           // 修复3.1: stop() 后标志，防止已销毁上下文继续运行
    let proactiveTimer = null
    let listeningTimer = null
    let currentAudio = null
    let ws = null
    let audioCtx = null
    let workletNode = null
    let mediaStream = null
    let lastProcessedText = ''      // 修复3.2: 防止重复处理相同文本

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
        if (destroyed) return  // 修复3.1: 已销毁，不再处理

        // 修复3.3: 收到音频时清除 proactiveTimer，防止 proactive 与用户语音同时到达
        clearProactiveTimer()

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
                // 修复3.1: 已销毁，不再处理
                if (destroyed) break
                // 修复3: SPEAKING 时忽略过期的 final
                if (state === STATE.SPEAKING) {
                    console.log(`[Companion] 忽略过期 final (当前状态: ${state})`)
                    break
                }
                // 修复3.2: 去重，防止重复处理相同文本
                if (msg.text && msg.text === lastProcessedText) {
                    console.log(`[Companion] 忽略重复 final: '${msg.text}'`)
                    break
                }
                lastProcessedText = msg.text
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
    const TTS_TIMEOUT = 10000  // TTS 请求超时时间
    const SPEECH_SYNTHESIS_TIMEOUT = 30000  // SpeechSynthesis 超时时间

    async function speakText(text) {
        let speakEndCalled = false
        const safeOnSpeakEnd = () => {
            if (speakEndCalled) return
            speakEndCalled = true
            onSpeakEnd()
        }

        let url = null  // 用于跟踪 Blob URL

        try {
            // 修复4.2: 添加 AbortController 超时保护
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT)

            try {
                const resp = await fetch(VC.Config.API_BASE + '/voice/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, voice: 'Chloe' }),
                    signal: controller.signal
                })
                clearTimeout(timeout)

                if (resp.ok) {
                    const blob = await resp.blob()
                    url = URL.createObjectURL(blob)
                    currentAudio = new Audio(url)
                    return new Promise((resolve) => {
                        // 修复4.1: 确保所有路径都释放 Blob URL
                        currentAudio.onended = () => {
                            if (url) URL.revokeObjectURL(url)
                            currentAudio = null
                            safeOnSpeakEnd()
                            resolve()
                        }
                        currentAudio.onerror = () => {
                            if (url) URL.revokeObjectURL(url)
                            currentAudio = null
                            safeOnSpeakEnd()
                            resolve()
                        }
                        currentAudio.play().catch(() => {
                            // 修复4.1: play() 失败时也释放 URL
                            if (url) URL.revokeObjectURL(url)
                            currentAudio = null
                            safeOnSpeakEnd()
                            resolve()
                        })
                    })
                }
            } catch (fetchError) {
                clearTimeout(timeout)
                // 如果是超时或其他 fetch 错误，继续到降级逻辑
                if (fetchError.name === 'AbortError') {
                    console.warn('[Companion] TTS 请求超时')
                } else {
                    console.warn('[Companion] TTS 请求失败:', fetchError)
                }
                // 释放可能已创建的 URL
                if (url) URL.revokeObjectURL(url)
            }
        } catch (e) {
            console.warn('[Companion] TTS 失败:', e)
            if (url) URL.revokeObjectURL(url)
        }

        // 修复4.3: 降级到 SpeechSynthesis，添加超时保护
        return new Promise((resolve) => {
            const u = new SpeechSynthesisUtterance(text)
            u.lang = 'zh-CN'
            u.rate = 0.9

            // 超时保护，防止长文本中途停止
            const speechTimeout = setTimeout(() => {
                console.warn('[Companion] SpeechSynthesis 超时，强制结束')
                speechSynthesis.cancel()
                safeOnSpeakEnd()
                resolve()
            }, SPEECH_SYNTHESIS_TIMEOUT)

            u.onend = () => {
                clearTimeout(speechTimeout)
                safeOnSpeakEnd()
                resolve()
            }
            u.onerror = (e) => {
                // 修复4.3: 错误时也要清理
                clearTimeout(speechTimeout)
                console.warn('[Companion] SpeechSynthesis 错误:', e)
                safeOnSpeakEnd()
                resolve()
            }

            try {
                speechSynthesis.speak(u)
            } catch (e) {
                // 修复4.3: speak() 可能抛出异常
                clearTimeout(speechTimeout)
                console.warn('[Companion] SpeechSynthesis.speak() 异常:', e)
                safeOnSpeakEnd()
                resolve()
            }
        })
    }

    function onSpeakEnd() {
        // 修复3.1: 已销毁，不再处理状态变化
        if (destroyed) {
            console.log('[Companion] onSpeakEnd 忽略：已销毁')
            return
        }
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
            const url = `${protocol}//${location.host}/ai/v1/gateway`
            console.log('[Companion] 连接 WebSocket:', url)

            try {
                ws = new WebSocket(url)
            } catch (e) {
                console.error('[Companion] WebSocket 创建失败:', e)
                reject(new Error('WebSocket 创建失败: ' + e.message))
                return
            }

            ws.binaryType = 'arraybuffer'

            ws.onopen = () => {
                console.log('[Companion] WS 已连接')
                resolve()
            }

            ws.onerror = (e) => {
                console.error('[Companion] WS 错误:', e)
                reject(new Error('WebSocket 连接失败'))
            }

            ws.onmessage = (e) => {
                if (e.data instanceof ArrayBuffer) return
                try {
                    handleMessage(JSON.parse(e.data))
                } catch (err) {
                    console.warn('[Companion] 消息解析失败:', err)
                }
            }

            ws.onclose = (e) => {
                console.log(`[Companion] WS 关闭: code=${e.code} reason=${e.reason}`)
                if (!destroyed) {
                    // 非主动断开，尝试重连
                    setTimeout(() => {
                        if (!destroyed && (!ws || ws.readyState === WebSocket.CLOSED)) {
                            console.log('[Companion] 尝试重连...')
                            connectWS().catch(e => console.error('[Companion] 重连失败:', e))
                        }
                    }, 3000)
                }
            }

            // 超时处理
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.CONNECTING) {
                    console.error('[Companion] WS 连接超时')
                    ws.close()
                    reject(new Error('WebSocket 连接超时'))
                }
            }, 10000)
        })
    }

    // ── 麦克风 + 音频流 ──
    let isSpeaking = false  // VAD检测到人声

    async function startMic() {
        console.log('[Companion] 请求麦克风...')
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
            console.log('[Companion] 麦克风已获取')
        } catch (e) {
            console.error('[Companion] 麦克风获取失败:', e.name, e.message)
            throw new Error('麦克风权限被拒绝或不可用: ' + e.message)
        }

        // 尝试使用 16kHz，如果不支持则使用默认采样率
        try {
            audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
        } catch (e) {
            console.warn('[Companion] 不支持 16kHz，使用默认采样率')
            audioCtx = new AudioContext()
        }
        actualSampleRate = audioCtx.sampleRate
        console.log(`[Companion] AudioContext: ${actualSampleRate}Hz (目标: ${TARGET_SAMPLE_RATE}Hz)`)

        if (audioCtx.state === 'suspended') {
            console.log('[Companion] AudioContext 暂停，恢复中...')
            await audioCtx.resume()
        }

        // 用 vad-processor 检测人声，只有人声才发送音频
        console.log('[Companion] 加载 VAD 处理器...')
        try {
            await audioCtx.audioWorklet.addModule('/vad-processor.js')
            console.log('[Companion] VAD 处理器加载成功')
        } catch (e) {
            console.error('[Companion] VAD 处理器加载失败:', e)
            throw new Error('语音检测模块加载失败: ' + e.message)
        }
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
            destroyed = false  // 重置销毁标志
            lastProcessedText = ''  // 重置去重标志
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
            destroyed = true  // 修复3.1: 标记已销毁，防止回调继续执行
            clearProactiveTimer()
            clearListeningTimeout()
            stopCurrentAudio()
            stopMic()
            if (ws) { sendJSON({ action: 'stop' }); ws.close(); ws = null }
            setState(STATE.IDLE)
        },

        getState() {
            return state;
        },

        sendText(text) {
            const objs = VCTools ? VCTools.getObjects() : []
            const canvasW = VCTools ? VCTools.canvas.width : 800
            const canvasH = VCTools ? VCTools.canvas.height : 600

            const ctx = objs.length === 0 ? '画布为空' : objs.map((o, i) => {
                const typeName = o.type === 'rect' ? '矩形' : o.type === 'ellipse' ? '椭圆' : o.type === 'i-text' ? '文字' : o.type === 'group' ? '编组' : o.type || '对象'
                const tag = o.tag ? `"${o.tag}"` : `#${i + 1}`
                const x = Math.round(o.left || 0)
                const y = Math.round(o.top || 0)
                const w = Math.round((o.width || 0) * (o.scaleX || 1))
                const h = Math.round((o.height || 0) * (o.scaleY || 1))
                const color = o.fill && o.fill !== 'transparent' ? o.fill : '无填充'
                const stroke = o.stroke && o.stroke !== 'transparent' ? `描边${o.stroke}` : ''
                const rot = o.angle ? `旋转${Math.round(o.angle)}°` : ''
                const opacity = o.opacity !== undefined && o.opacity !== 1 ? `透明度${(o.opacity * 100).toFixed(0)}%` : ''

                return `[${tag}] ${typeName} pos(${x},${y}) size(${w}x${h}) color=${color} ${stroke} ${rot} ${opacity}`.trim()
            }).join('\n')

            // 计算对象之间的空间关系
            let relations = ''
            if (objs.length >= 2) {
                const rels = []
                for (let i = 0; i < objs.length; i++) {
                    for (let j = i + 1; j < objs.length; j++) {
                        const a = objs[i], b = objs[j]
                        if (a.x !== undefined && b.x !== undefined) {
                            const dx = (b.x - a.x) * canvasW
                            const dy = (b.y - a.y) * canvasH
                            const dist = Math.round(Math.sqrt(dx * dx + dy * dy))
                            const dir = Math.abs(dx) > Math.abs(dy)
                                ? (dx > 0 ? '右' : '左')
                                : (dy > 0 ? '下' : '上')
                            const aTag = a.tag || `#${i + 1}`
                            const bTag = b.tag || `#${j + 1}`
                            if (dist < 50) rels.push(`${bTag}紧挨${aTag}`)
                            else rels.push(`${bTag}在${aTag}${dir}侧${dist}px`)
                        }
                    }
                }
                if (rels.length > 0) relations = '\n空间关系: ' + rels.slice(0, 10).join('；')
            }

            const canvasInfo = `画布${canvasW}x${canvasH}px 坐标系(0-1) (0,0)=左上 (0.5,0.5)=中心 (1,1)=右下`
            sendJSON({ action: 'text', text, canvas_context: `${canvasInfo}\n对象:\n${ctx}${relations}` })
        },

        getState() { return state }
    }

    console.log('[Companion] 模块加载完成')
})()
