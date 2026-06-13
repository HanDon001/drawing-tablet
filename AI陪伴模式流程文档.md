# AI 陪伴模式 — 完整逻辑与流程文档

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (web01)                                               │
│                                                             │
│  index.html ──► companion.js ──► WebSocket ──► 后端          │
│       │              │                                       │
│       │         vad-processor.js (AudioWorklet)              │
│       │              │                                       │
│       └──── voice.js (普通模式，独立)                         │
│                                                             │
│  加载的框架: vc.js → state.js → voice.js → companion.js      │
│             → cmd.js → ui.js → ai_draw.js                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  后端 (ai-service01)                                        │
│                                                             │
│  gateway_ws.py (WebSocket网关)                              │
│       │                                                     │
│       ├─► asr_service.py (ASRSession) ──► DashScope ASR     │
│       ├─► llm_service.py (DeepSeek Function Calling)        │
│       └─► tts_service.py (MiMo TTS)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、文件清单与职责

| 文件 | 路径 | 职责 |
|------|------|------|
| companion.js | web01/js/companion.js | AI陪伴模式核心：状态机、音频缓冲、WebSocket、TTS |
| vad-processor.js | web01/public/vad-processor.js | AudioWorklet：能量检测VAD，只有人声才发音频帧 |
| gateway_ws.py | ai-service01/app/routers/gateway_ws.py | WebSocket网关：接收音频→ASR→LLM→返回结果 |
| asr_service.py | ai-service01/app/services/asr_service.py | DashScope Realtime ASR 持久会话 |
| llm_service.py | ai-service01/app/services/llm_service.py | DeepSeek Function Calling LLM |
| tts_service.py | ai-service01/app/services/tts_service.py | MiMo TTS 语音合成 |
| index.html | web01/index.html | 前端页面 + enterAIMode/exitAIMode 编排 |

---

## 三、状态机

### 3.1 状态定义 (companion.js)

```javascript
const STATE = {
    IDLE: 'idle',           // 空闲，等待用户说话
    LISTENING: 'listening', // 正在听（收到ASR partial）
    PROCESSING: 'processing', // LLM处理中（收到ASR final）
    SPEAKING: 'speaking',   // TTS播报中
    PROACTIVE: 'proactive'  // 主动搭话中
}
```

### 3.2 状态转换图

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
                ┌──────┐    ASR partial    ┌────────────┐
                │ IDLE │ ────────────────► │  LISTENING  │
                └──────┘                   └────────────┘
                    │                              │
                    │ 20秒无语音                     │ ASR final
                    │ (主动搭话)                     │
                    ▼                              ▼
             ┌───────────┐                 ┌────────────┐
             │ PROACTIVE  │                 │ PROCESSING │
             └───────────┘                 └────────────┘
                    │                              │
                    │ LLM回复                       │ LLM reply
                    ▼                              ▼
                ┌──────┐    TTS结束         ┌────────────┐
                │ IDLE │ ◄──────────────── │  SPEAKING   │
                └──────┘                   └────────────┘
```

### 3.3 状态转换触发条件

| 转换 | 触发条件 | 代码位置 |
|------|----------|----------|
| * → IDLE | 收到 `status: listening` 或 `error` 消息 | companion.js handleMessage() |
| IDLE → LISTENING | 收到 ASR `partial` 消息 | companion.js handleMessage() case 'partial' |
| LISTENING → PROCESSING | 收到 ASR `final` 消息 | companion.js handleMessage() case 'final' |
| PROCESSING → SPEAKING | 收到 LLM `reply` 或 `proactive_reply` | companion.js handleMessage() case 'reply' |
| SPEAKING → IDLE | TTS播放结束（onended/onerror） | companion.js onSpeakEnd() |
| IDLE → PROACTIVE | 主动搭话定时器触发（20秒无语音） | companion.js startProactiveTimer() |
| PROACTIVE → SPEAKING | 收到 `proactive_reply` | companion.js handleMessage() case 'proactive_reply' |

---

## 四、音频流程（从前端到后端）

### 4.1 完整链路

```
麦克风 (getUserMedia, 48kHz)
    │
    ▼
AudioContext → MediaStreamSource
    │
    ▼
vad-processor.js (AudioWorklet)
    │  计算 RMS 能量
    │  阈值: 0.008
    │
    ├─ rms > 阈值 → speech_start + 发送 audio 帧
    │
    ├─ rms < 阈值 且 speaking → 继续发 audio (hangover保护尾音)
    │                          hangover: 500帧 ≈ 1.3秒 @48kHz
    │
    └─ rms < 阈值 超过hangover → speech_end
    │
    ▼
companion.js handleAudio()
    │  缓冲 Float32 帧
    │  攒够 8000 samples (~167ms @48kHz) 才发送
    │  SPEAKING状态时不发送（防回声）
    │
    ▼ (每 ~167ms 一块)
WebSocket 二进制发送 (Int16 PCM)
    │
    ▼
gateway_ws.py receive()
    │  更新 last_audio_time
    │  转发给 ASRSession.send_audio()
    │
    ▼
DashScope Realtime ASR (server_vad)
    │  返回 partial → 前端显示
    │  返回 final → 触发 process_text()
    │
    ▼
gateway_ws.py periodic_commit()
    │  每1秒检查
    │  用户停顿4秒 → commit → ASR返回final
    │
    ▼
llm_service.chat() (DeepSeek)
    │  返回 actions + reply
    │
    ▼
gateway_ws.py → WebSocket JSON → 前端
    │
    ▼
companion.js handleMessage()
    ├─ onActions → VC.Cmd.execute() → 画布操作
    └─ onReply → speakText() → TTS播报
```

### 4.2 音频格式转换

```
Float32 (vad-processor输出)
    │
    ├─ companion.js 攒缓冲 (Float32Array[])
    │
    ├─ 合并为一个 Float32Array
    │
    ├─ Float32 → Int16 (×32767)
    │
    └─ WebSocket.send(int16.buffer)  // 二进制发送
```

### 4.3 vad-processor.js 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| energyThreshold | 0.008 | RMS能量阈值，低于此值视为静音 |
| hangoverFrames | 500 | 静音后继续发送的帧数（保护尾音）|

### 4.4 companion.js 音频参数

| 参数 | 值 | 说明 |
|------|-----|------|
| CHUNK_SAMPLES | 8000 | 缓冲区大小，攒够才发送 |

---

## 五、打断机制

### 5.1 防回声（核心）

```javascript
// companion.js handleAudio()
if (state === STATE.SPEAKING) return  // 播报时不发音频
```

TTS播报时，前端停止发送音频，防止AI自己的声音被ASR识别。

### 5.2 TTS中断

```javascript
// companion.js stopCurrentAudio()
if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null }
speechSynthesis.cancel()
```

调用 `VC.Companion.stop()` 时会强制停止TTS。

### 5.3 TTS回调防重复

```javascript
let speakEndCalled = false
const safeOnSpeakEnd = () => {
    if (speakEndCalled) return
    speakEndCalled = true
    onSpeakEnd()
}
```

防止 onended 和 onerror 同时触发导致 onSpeakEnd 被调用两次。

### 5.4 后端LLM互斥锁

```python
# gateway_ws.py
processing = False

async def process_text(text, ...):
    nonlocal processing
    if processing:
        logger.warning(f"[GW] LLM 忙，跳过: '{text[:30]}'")
        return
    processing = True
    # ... 处理 ...
    processing = False
```

LLM处理期间，新的ASR final结果会被丢弃。

---

## 六、主动搭话机制

### 6.1 前端定时器

```javascript
// companion.js
const PROACTIVE_TIMEOUT = 20000  // 20秒

function startProactiveTimer() {
    clearProactiveTimer()
    proactiveTimer = setTimeout(() => {
        if (state === STATE.IDLE) {
            setState(STATE.PROACTIVE)
            sendJSON({ action: 'proactive' })
        }
    }, PROACTIVE_TIMEOUT)
}
```

触发时机：TTS播报结束后（onSpeakEnd → startProactiveTimer）

### 6.2 后端处理

```python
# gateway_ws.py
elif action == "proactive":
    asyncio.create_task(process_text(
        "用户已沉默20秒，用一句温暖的话引导用户继续创作，不要催促。",
        is_proactive=True
    ))
```

### 6.3 定时器重置时机

| 事件 | 操作 |
|------|------|
| TTS播放结束 (onSpeakEnd) | 启动定时器 |
| 收到 partial/final | 不重置（保持运行） |
| 进入 PROCESSING/SPEAKING | process_text 开始时重置 last_audio_time |
| VC.Companion.stop() | 清除定时器 |

---

## 七、周期性 Commit 机制

### 7.1 问题背景

DashScope Realtime ASR 使用 server_vad，但需要客户端发送 `commit` 信号才能返回 final 结果。

### 7.2 实现

```python
# gateway_ws.py
async def periodic_commit():
    nonlocal last_audio_time
    while True:
        await asyncio.sleep(1.0)  # 每1秒检查
        if processing:             # LLM处理中，跳过
            continue
        if last_audio_time > 0 and (time.time() - last_audio_time) > 4.0:
            try:
                await asr.commit()  # 停顿4秒，触发识别
            except Exception as e:
                logger.warning(f"[GW] commit 失败: {e}")
            last_audio_time = 0     # 重置
```

### 7.3 两种commit触发方式

| 方式 | 触发条件 | 说明 |
|------|----------|------|
| speech_end | VAD检测到人声结束 | 前端发送 `{ action: 'speech_end' }` |
| periodic_commit | 停顿4秒无音频 | 后端定时器自动触发 |

### 7.4 last_audio_time 更新

```python
# gateway_ws.py 主循环
if "bytes" in data and data["bytes"]:
    audio_count += 1
    last_audio_time = time.time()  # 每收到音频块就更新
    await asr.send_audio(data["bytes"])
```

---

## 八、前端 UI 编排 (index.html)

### 8.1 进入AI陪伴模式

```javascript
async function activateAIMode() {
    // 1. 播放彩虹转场动画
    await playSuperTransition()

    // 2. 切换UI
    document.body.classList.add('ai-mode')
    document.getElementById('micBtn').style.display = 'none'
    document.getElementById('aiControlArea').style.display = ''

    // 3. 启动 VC.Companion
    VC.Companion.start({
        onPartial: (text) => { showAITextBubble('🎤 ' + text) },
        onFinal: (text) => { addChat('user', text) },
        onActions: (actions) => { VC.Cmd.execute(action); redrawAll() },
        onReply: (text) => { addChat('assistant', text) },
        onStateChange: (newState) => {
            switch (newState) {
                case 'idle':      showAITextBubble('正在聆听...'); break
                case 'listening': showAITextBubble('🎤 听到你在说话...'); break
                case 'processing': showAITextBubble('🧠 思考中...'); break
                case 'proactive': showAITextBubble('💭 让我想想...'); break
            }
        }
    })

    // 4. 启动背景粒子 + 声波可视化
    startBgParticles()
    startVizAnimation()
}
```

### 8.2 退出AI陪伴模式

```javascript
function deactivateAIMode() {
    // 1. 切换UI
    document.body.classList.remove('ai-mode')

    // 2. 停止 VC.Companion（关闭WebSocket + 停止麦克风 + 停止TTS）
    VC.Companion.stop()

    // 3. 停止背景粒子 + 声波可视化
    stopBgParticles()
    stopVizAnimation()
}
```

---

## 九、后端 gateway_ws.py 完整流程

```
客户端连接
    │
    ├─ 创建 ASRSession → 连接 DashScope
    ├─ 启动 periodic_commit 后台任务
    ├─ 启动 _listen_task 监听 ASR 结果
    │
    ▼
主循环 (while True)
    │
    ├─ 收到二进制音频 → asr.send_audio() + 更新 last_audio_time
    │
    ├─ 收到文本消息:
    │   ├─ action: "speech_end" → asr.commit()
    │   ├─ action: "proactive"  → process_text("用户已沉默20秒...")
    │   ├─ action: "text"       → process_text(text, canvas_context)
    │   └─ action: "stop"       → break 退出循环
    │
    └─ ASR 回调 (_listen_task):
        ├─ partial → send_json({ type: 'partial', text })
        └─ final   → send_json({ type: 'final', text })
                     → process_text(text, canvas_context)

process_text():
    │
    ├─ 检查 processing 互斥锁
    ├─ 重置 last_audio_time = 0
    ├─ llm_service.chat(text, canvas_context, is_proactive)
    ├─ 发送 actions (如有)
    └─ 发送 reply / proactive_reply

客户端断开
    │
    ├─ 取消 periodic_commit
    ├─ 关闭 ASRSession
    └─ 记录日志
```

---

## 十、画布上下文传递

### 10.1 前端构建

```javascript
// companion.js sendText()
const objs = VC.State.objects || []
const ctx = objs.length === 0 ? '画布为空' : objs.map(o => {
    const pos = POS_NAMES[o.position] || o.position
    const shape = SHAPE_NAMES[o.shape] || o.shape
    const tag = o.tag ? `，叫"${o.tag}"` : ''
    return `${pos}有${o.color}${shape}${tag}`
}).join('；')
sendJSON({ action: 'text', text, canvas_context: ctx })
```

### 10.2 后端缓存

```python
# gateway_ws.py
last_canvas_context = None

# 收到 text 消息时更新
elif action == "text":
    canvas_ctx = msg.get("canvas_context")
    if canvas_ctx:
        last_canvas_context = canvas_ctx

# ASR final 时使用缓存
async def _on_final(text):
    asyncio.create_task(process_text(text, canvas_context=last_canvas_context))
```

---

## 十一、TTS 播报流程

```javascript
// companion.js speakText()
async function speakText(text) {
    // 1. 尝试后端 TTS (MiMo)
    const resp = await fetch('/voice/tts', { body: JSON.stringify({ text, voice: 'Chloe' }) })
    if (resp.ok) {
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        currentAudio = new Audio(url)
        // 等待播放结束 → onSpeakEnd()
        currentAudio.onended = () => { onSpeakEnd(); resolve() }
        currentAudio.play()
    }

    // 2. 降级：浏览器原生 SpeechSynthesis
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'; u.rate = 0.9
    u.onend = () => onSpeakEnd()
    speechSynthesis.speak(u)
}

function onSpeakEnd() {
    setState(STATE.IDLE)       // 回到空闲
    startProactiveTimer()      // 启动主动搭话定时器
}
```

---

## 十二、关键配置参数汇总

| 参数 | 文件 | 值 | 说明 |
|------|------|-----|------|
| PROACTIVE_TIMEOUT | companion.js | 20000ms | 主动搭话等待时间 |
| CHUNK_SAMPLES | companion.js | 8000 | 音频缓冲区大小 |
| energyThreshold | vad-processor.js | 0.008 | VAD能量阈值 |
| hangoverFrames | vad-processor.js | 500 | 尾音保护帧数 |
| commit间隔 | gateway_ws.py | 1秒检查, 4秒触发 | 周期性commit |
| TTS voice | companion.js | 'Chloe' | TTS音色 |
| LLM | llm_service.py | DeepSeek | 大模型 |
| ASR | asr_service.py | qwen3-asr-flash-realtime | 语音识别模型 |

---

## 十三、已知限制

1. **无法语音打断**：SPEAKING状态时前端不发音频，用户必须等AI说完
2. **hangover时长**：500帧 @48kHz ≈ 1.3秒，不是4秒（浏览器采样率影响）
3. **commit延迟**：最坏情况需要等4秒才commit（periodic_commit）
4. **LLM互斥**：处理中新的语音会被丢弃，不会排队
