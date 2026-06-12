# VoiceCanvas 系统架构与流程文档

## 一、项目目录结构

```
口述画板/
├── ai-service/                    # Python 后端 (FastAPI)
│   ├── .env                       # 环境变量 (API Key, 模型配置)
│   ├── requirements.txt           # Python 依赖
│   ├── run.py                     # Uvicorn 启动脚本
│   └── app/
│       ├── main.py                # FastAPI 入口 (CORS, 路由, 中间件)
│       ├── core/
│       │   ├── agent.py           # Agent 核心调度 (LLM Function Calling)
│       │   ├── agent_loop.py      # 永久循环 Agent (上下文/偏好/语气模板)
│       │   ├── config.py          # Pydantic Settings 配置中心
│       │   ├── http_client.py     # 全局 HTTP 连接池 (httpx)
│       │   ├── logger.py          # Loguru 日志
│       │   ├── metrics.py         # Prometheus 监控指标
│       │   ├── skill_base.py      # Skill 抽象基类
│       │   └── tool_registry.py   # 工具注册中心 (@register 装饰器)
│       ├── api/v1/
│       │   ├── agent.py           # POST /ai/v1/interpret (LLM 意图理解)
│       │   ├── agent_ws.py        # WS /ai/v1/agent (Agent 永久循环)
│       │   ├── voice.py           # POST /ai/v1/voice/asr + /tts
│       │   └── voice_ws.py        # WS /ai/v1/voice/asr/ws (ASR 代理)
│       └── skills/
│           ├── draw/
│           │   ├── skill.py       # DrawSkill (绘图 Prompt + 工具列表)
│           │   └── tools.py       # draw_shape, edit_shape, delete_shape
│           └── query/
│               ├── skill.py       # QuerySkill (查询 Prompt + 工具列表)
│               └── tools.py       # describe_canvas
│
├── web/                           # 前端
│   ├── index.html                 # 主页面 (2168行，完整 UI)
│   ├── site/index.html            # 官网落地页
│   ├── public/
│   │   ├── pcm-processor.js       # AudioWorklet PCM 分片
│   │   └── vad-processor.js       # AudioWorklet VAD 语音检测
│   ├── js/
│   │   ├── vc.js                  # 命名空间 + 配置
│   │   ├── state.js               # 状态管理 (EventBus)
│   │   ├── store.js               # localStorage 持久化
│   │   ├── canvas.js              # Canvas 渲染引擎
│   │   ├── voice.js               # 语音服务 (一次性录音 → ASR)
│   │   ├── parser.js              # 快通道指令检测
│   │   ├── cmd.js                 # 命令执行器 (LLM 意图理解)
│   │   ├── agent.js               # AI 演示 & 主题创作
│   │   ├── agent_loop.js          # Agent 永久循环控制器
│   │   ├── log.js                 # 日志面板
│   │   └── ui.js                  # UI 控制器
│   └── src/                       # Vue 3 应用 (备用)
│
├── AGENT_LOOP_DESIGN.md           # 本文档
├── start.bat                      # Windows 一键启动
└── start.sh                       # Linux/Mac 一键启动
```

---

## 二、系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器 (前端)                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ 麦克风    │  │  Canvas   │  │ 聊天面板  │  │ 语音播报 (TTS)   │ │
│  │ MediaRec. │  │  画布     │  │ 气泡消息  │  │ 小米 MiMo       │ │
│  └─────┬────┘  └─────┬────┘  └──────────┘  └────────┬─────────┘ │
│        │             │                               │           │
│  ┌─────┴─────────────┴───────────────────────────────┴─────────┐ │
│  │                    前端控制层                                 │ │
│  │                                                             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │ │
│  │  │ voice.js  │  │ cmd.js   │  │agent_loop│  │ canvas.js  │ │ │
│  │  │ 一次性录音 │  │ LLM意图  │  │ 永久循环  │  │ 渲染引擎   │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                    HTTP / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Python 后端 (FastAPI :8000)                  │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ ASR 代理  │  │ Agent 主循环  │  │ TTS 代理     │              │
│  │ MiMo ASR │  │ 千问 qwen3.6 │  │ MiMo TTS    │              │
│  └──────────┘  └──────────────┘  └──────────────┘              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   ToolRegistry 工具注册中心                │   │
│  │  draw_shape / edit_shape / delete_shape / describe_canvas │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│         外部 API             │                                   │
│  ┌──────────────────────────┴───────────────────────────────┐   │
│  │  千问 qwen3.6-plus (Function Calling)                    │   │
│  │  MiMo ASR (mimo-v2.5-asr)                               │   │
│  │  MiMo TTS (mimo-v2.5-tts, Chloe 温柔女声)               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、双模式架构

### 3.1 普通模式（麦克风按钮）

```
用户点击麦克风
    │
    ▼
MediaRecorder 录音 (webm/opus)
    │
    ▼ (用户再次点击停止)
Blob → Base64
    │
    ▼
POST /ai/v1/voice/asr  {audio_data, mime_type}
    │
    ▼
PyAV 转换 webm → WAV (16kHz mono)
    │
    ▼
MiMo ASR API → 返回文本
    │
    ▼
cmd.js processText()
    │
    ├─ 快通道: "撤销/清空/停止" → 本地直接执行
    │
    └─ 慢通道: POST /ai/v1/interpret
                    │
                    ▼
              Agent.chat() → 千问 qwen3.6-plus Function Calling
                    │
                    ├─ 返回 tool_calls → ToolRegistry.execute() → 再次调 LLM
                    │
                    └─ 直接返回文本 → 作为 reply
                    │
                    ▼
              {reply, actions}
                    │
                    ├─ actions → 前端执行画布操作
                    │
                    └─ reply → 聊天面板 + TTS 播报
```

### 3.2 AI 陪伴模式（Agent 永久循环）

```
用户点击"AI 陪伴"按钮
    │
    ▼
转场动画 (光球 + 光环 + 波纹 + 粒子)
    │
    ▼
切换 UI: 麦克风 → 声波可视化 + AI 头像按钮
    │
    ▼
AgentLoop.start()
    │
    ├─ 连接 WebSocket /ai/v1/agent
    │
    ├─ 后端 Agent 主循环:
    │   │
    │   ├─ 开场白: "你好呀，我是小画，你的语音绘画助手"
    │   │
    │   └─ while True:
    │       │
    │       ├─ 等待用户输入 (消息队列，30秒超时)
    │       │
    │       ├─ 收到文本 → process_input()
    │       │   │
    │       │   ├─ 解析指代词 ("它" → last_mouse_target)
    │       │   │
    │       │   ├─ 调用 LLM → 执行动作 → 学习偏好
    │       │   │
    │       │   └─ 温柔播报回复
    │       │
    │       └─ 超时 → 主动关怀
    │           │
    │           ├─ 空画布: "想画点什么吗？"
    │           ├─ 有图形: "画布上有3个图形，需要修改吗？"
    │           └─ 有偏好: "你好像喜欢蓝色，要继续画吗？"
    │
    └─ 前端:
        │
        ├─ 声波可视化 (Canvas 绘制圆环)
        │
        ├─ AI 头像按钮 (呼吸光环)
        │   │
        │   └─ 点击 → 语音输入
        │
        ├─ 文字气泡 (显示识别文本)
        │
        └─ Barge-in: 检测到新语音 → 停止当前 TTS → 清空队列
```

---

## 四、核心模块说明

### 4.1 Agent 核心调度 (agent.py)

```python
class Agent:
    FALLBACK_MODELS = ["qwen3.6-plus", "qwen-plus", "qwen-turbo"]

    def chat(text, canvas_context) → {reply, actions}
        # 1. _route_skill() 关键词路由 (查询 → QuerySkill, 默认 → DrawSkill)
        # 2. 构建 messages (系统提示 + Skill Prompt + 画布上下文 + 用户输入)
        # 3. 调用 LLM (tools=当前 Skill 工具列表)
        # 4. 如果返回 tool_calls → 执行工具 → 再次调 LLM
        # 5. 如果直接返回文本 → 作为 reply

    def _call_llm_with_fallback(messages, tools)
        # 多模型降级: qwen3.6-plus → qwen-plus → qwen-turbo

    def _local_fallback(text)
        # 离线兜底: 正则匹配基础指令 ("画圆" → draw_shape circle)
```

### 4.2 永久循环 Agent (agent_loop.py)

```python
class AgentLoop:
    agent          # Agent 实例
    context        # ConversationContext (最近5轮对话)
    canvas         # CanvasState (画布对象列表)
    prefs          # UserPreferences (颜色/形状/位置偏好频率)
    idle_timeout   # 30秒无操作触发关怀

    TONE_TEMPLATES = {
        "confirm":    ["好的，{action}了。", "完成啦，{action}。"],
        "error":      ["没关系，{reason}，我们再试一次。"],
        "greeting":   ["你好呀，我是小画，你的语音绘画助手。"],
        "idle_care":  ["还在吗？需要帮忙吗？"],
        "empty_canvas": ["画布还是空的，想画点什么吗？"],
    }

    def process_input(text)
        # 解析指代词 → 调用 LLM → 执行动作 → 学习偏好 → 温柔播报

    def proactive_care()
        # 空闲关怀 + 偏好建议
```

### 4.3 工具注册中心 (tool_registry.py)

```python
@ToolRegistry.register("draw_shape")
def draw_shape(shape_type, position, color="black", size="medium", tag=None):
    """在画布上绘制一个形状"""

@ToolRegistry.register("edit_shape")
def edit_shape(target_tag, new_color=None, new_size=None, new_position=None):
    """修改画布上已有图形的属性"""

@ToolRegistry.register("delete_shape")
def delete_shape(target_tag):
    """删除画布上的图形"""

@ToolRegistry.register("describe_canvas")
def describe_canvas():
    """描述当前画布上的内容"""
```

---

## 五、API 路由汇总

| 路径 | 协议 | 用途 | 调用方 |
|------|------|------|--------|
| `/ai/v1/interpret` | HTTP POST | LLM 意图理解 + 工具调用 | cmd.js (普通模式) |
| `/ai/v1/agent` | WebSocket | Agent 永久循环 | agent_loop.js (AI陪伴模式) |
| `/ai/v1/voice/asr` | HTTP POST | 语音识别 (MiMo ASR) | voice.js |
| `/ai/v1/voice/tts` | HTTP POST | 语音合成 (MiMo TTS) | voice.js / agent_loop.js |
| `/ai/v1/voice/asr/ws` | WebSocket | ASR 代理 (DashScope) | 备用 |
| `/ai/v1/health` | HTTP GET | 健康检查 | 启动检测 |
| `/metrics` | HTTP GET | Prometheus 监控指标 | 运维 |

---

## 六、语音播报策略

### TTS 配置

```python
TTS_CONFIG = {
    "model": "mimo-v2.5-tts",
    "voice": "Chloe",  # 温柔女声
    "style": "Gentle, warm, caring, slow pace",
}
```

### 播报时机

| 场景 | 播报内容 | 示例 |
|------|---------|------|
| 开场 | 欢迎语 + 画布状态 | "你好呀，我是小画。画布是空的，想画点什么吗？" |
| 执行完成 | 温柔确认 | "好的，已经画了一个红色的圆在中间" |
| 查询结果 | 生动描述 | "画布中间有一个红色的大圆，左上角有个蓝色的小方块" |
| 出错 | 安慰 + 引导 | "没关系，我没太听清，你能再说一次吗？" |
| 空闲关怀 | 主动询问 | "还在吗？需要帮忙吗？" |
| 偏好建议 | 个性化推荐 | "你好像喜欢蓝色，要继续画吗？" |

### Barge-in 打断

```
TTS 播报中 → VAD 检测到新语音 → 立即暂停 TTS → 清空队列 → 处理新指令
```

---

## 七、完整交互流程示例

```
用户: (打开页面，点击"AI 陪伴")
小画: (转场动画) 你好呀，我是小画，你的语音绘画助手。画布是空的，告诉我你想画什么吧。

用户: 画一个红色的圆
小画: 好的，已经在画布中间画了一个红色的圆。

用户: 在左上角画一个蓝色的大方块
小画: 完成啦，蓝色的大方块在左上角。

用户: 把它改成绿色
小画: 已经把左上角的方块改成绿色了。

用户: 看看画布上有什么
小画: 画布上有 2 个图形。中间有一个红色的圆，左上角有一个绿色的大方块。

用户: (沉默 30 秒)
小画: 还在吗？画布上有 2 个图形，想修改什么吗？

用户: 清空画布
小画: 好的，画布已经清空了。

用户: 帮我画一幅风景画
小画: 好的，我来帮你画一幅风景。先画一片蓝天...
小画: 蓝天画好了。接下来画一座小山...
小画: 完成了！画布上方有黄色的太阳，中间是蓝天，下方有绿色的山。
```

---

## 八、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML + Tailwind CSS + Vanilla JS + Canvas API |
| 后端 | Python FastAPI + Uvicorn |
| LLM | 千问 qwen3.6-plus (OpenAI 兼容 Function Calling) |
| ASR | 小米 MiMo ASR (mimo-v2.5-asr) + PyAV 格式转换 |
| TTS | 小米 MiMo TTS (mimo-v2.5-tts, Chloe 温柔女声) |
| 通信 | HTTP REST + WebSocket |
| 监控 | Prometheus metrics + Loguru 日志 |
