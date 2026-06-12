# VoiceCanvas 永久循环 Agent 设计文档

> 目标：构建一个 **全程由 AI 驱动** 的语音绘图系统，服务于视障及肢体障碍用户。
> 用户无需视觉、无需双手，仅凭语音即可完成所有操作，AI 全程温柔陪伴引导。

---

## 一、核心理念

```
传统模式：用户 → 看界面 → 点按钮 → 看结果
目标模式：用户 → 说话 → AI 理解 → AI 执行 → AI 告诉你做了什么
```

**AI 不是工具，是陪伴者。**

- 语气温和温柔，像朋友在旁边帮你画画
- 每一步操作都有语音确认："好的，我已经在画布中间画了一个红色的圆"
- 出错时安慰而不是报错："没关系，我再试一次"
- 主动引导："画布上现在有 3 个图形，你想画点什么吗？"

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器 (前端)                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ 麦克风    │  │  Canvas   │  │ 聊天面板  │  │ 语音播报 (TTS)   │ │
│  │ (VAD+ASR) │  │  画布     │  │ 对话记录  │  │ 小米 MiMo       │ │
│  └─────┬────┘  └─────┬────┘  └──────────┘  └────────┬─────────┘ │
│        │             │                               │           │
│  ┌─────┴─────────────┴───────────────────────────────┴─────────┐ │
│  │                    前端 Agent 控制器                           │ │
│  │                                                              │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │ │
│  │  │ 语音管理  │  │ 意图路由  │  │ 动作执行  │  │ 反馈播报     │ │ │
│  │  │ 全双工    │  │ 快/慢通道 │  │ 画布操作  │  │ TTS 队列     │ │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Python 后端 (FastAPI)                        │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ ASR 代理  │  │ Agent 主循环  │  │ TTS 代理     │              │
│  │ DashScope │  │ 千问 qwen3.6 │  │ MiMo TTS    │              │
│  └──────────┘  └──────────────┘  └──────────────┘              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   永久循环 Agent                           │   │
│  │                                                          │   │
│  │  while True:                                             │   │
│  │    1. 监听用户输入 (语音/文字)                              │   │
│  │    2. 理解意图 + 上下文                                    │   │
│  │    3. 执行动作                                            │   │
│  │    4. 温柔播报结果                                         │   │
│  │    5. 等待下一条指令                                       │   │
│  │    6. 空闲时主动关怀                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、永久循环 Agent 核心逻辑

### 3.1 循环状态机

```
         ┌──────────────────────────────────────┐
         │                                      │
         ▼                                      │
    ┌─────────┐    用户说话    ┌───────────┐    │
    │  空闲    │──────────────→│  倾听中    │    │
    │ (idle)   │              │ (listening) │    │
    └─────────┘              └─────┬─────┘    │
         ▲                         │           │
         │                    识别完成          │
         │                         ▼           │
         │               ┌───────────┐        │
         │               │  理解中    │        │
         │               │(processing)│        │
         │               └─────┬─────┘        │
         │                     │               │
         │              ┌──────┴──────┐        │
         │              ▼             ▼        │
         │        ┌─────────┐  ┌──────────┐   │
         │        │ 执行动作  │  │ 直接回复  │   │
         │        │(execute) │  │ (reply)  │   │
         │        └────┬────┘  └────┬─────┘   │
         │             │            │          │
         │             ▼            │          │
         │        ┌─────────┐      │          │
         │        │ 播报结果  │←────┘          │
         │        │(speaking)│                 │
         │        └────┬────┘                 │
         │             │                       │
         └─────────────┘                       │
              ▲                                │
              │          30秒无操作             │
              └────────────────────────────────┘
                   主动关怀："还在吗？需要帮忙吗？"
```

### 3.2 Agent 主循环（后端）

```python
class VoiceAgent:
    """
    永久循环 Agent
    不是请求-响应模式，而是持续陪伴模式
    """

    def __init__(self):
        self.state = "idle"
        self.context = ConversationContext()  # 对话上下文
        self.canvas_state = CanvasState()     # 画布状态
        self.last_activity = time.time()
        self.idle_timeout = 30  # 30秒无操作触发关怀

    async def run_forever(self, ws):
        """永久循环主入口"""
        # 开场白
        await self.speak(ws, "你好，我是小画，你的语音绘画助手。告诉我你想画什么吧。")

        while True:
            try:
                # 1. 等待用户输入（带超时）
                user_input = await self.wait_for_input(ws, timeout=self.idle_timeout)

                if user_input is None:
                    # 超时：主动关怀
                    await self.proactive_care(ws)
                    continue

                # 2. 处理输入
                await self.process_input(ws, user_input)

                # 3. 更新活跃时间
                self.last_activity = time.time()

            except Exception as e:
                logger.error(f"Agent 循环错误: {e}")
                await self.speak(ws, "出了点小问题，我再试一次。")
                continue

    async def process_input(self, ws, user_input: str):
        """处理用户输入"""
        self.state = "processing"

        # 加入对话上下文
        self.context.add("user", user_input)

        # 快通道检测
        fast_cmd = self.detect_fast_command(user_input)
        if fast_cmd:
            await self.execute_fast(ws, fast_cmd, user_input)
            return

        # 慢通道：调用 LLM
        result = await self.call_llm(user_input)

        # 执行动作
        if result.actions:
            for action in result.actions:
                await self.execute_action(ws, action)

        # 播报结果
        await self.speak(ws, result.reply)

        # 加入对话上下文
        self.context.add("assistant", result.reply)

    async def proactive_care(self, ws):
        """主动关怀（空闲时）"""
        canvas_desc = self.canvas_state.describe()

        if self.canvas_state.is_empty():
            await self.speak(ws, "画布还是空的呢，想画点什么吗？你可以说'画一个红色的圆'。")
        else:
            await self.speak(ws, f"画布上有{self.canvas_state.count()}个图形。需要修改什么，或者画点新的吗？")

    async def speak(self, ws, text: str):
        """温柔播报"""
        self.state = "speaking"

        # 发送到前端
        await ws.send_json({
            "type": "speak",
            "text": text,
            "tone": "gentle"  # 温柔语气标记
        })

        # 等待播报完成
        await self.wait_speaking_done(ws)
        self.state = "idle"
```

---

## 四、前端 Agent 控制器

### 4.1 全双工语音管理

```javascript
class VoiceAgentController {
    constructor() {
        this.state = 'idle'
        this.audioQueue = []
        this.isSpeaking = false
        this.isListening = false
        this.ws = null
    }

    /**
     * 全双工：TTS 播报时也能打断
     */
    onVADDetected() {
        // 用户说话 → 立即停止播报
        if (this.isSpeaking) {
            this.stopSpeaking()
            this.showStatus('🎤 你在说话，我听着...')
        }
    }

    /**
     * 播报结果（温柔语气）
     */
    async speak(text, tone = 'gentle') {
        this.isSpeaking = true
        this.showStatus('🔊 ' + text)

        // 调用 MiMo TTS（温柔语音包）
        const audio = await fetchTTS(text, {
            voice: 'Chloe',           // 温柔女声
            style: 'Gentle, warm, caring tone'  // 温柔风格
        })

        await this.playAudio(audio)
        this.isSpeaking = false

        // 播报完 → 显示在聊天面板
        this.addChatMessage('assistant', text)
    }

    /**
     * 执行动作 + 即时反馈
     */
    async executeAction(action) {
        // 第一层：即时视觉反馈（半透明预览）
        this.canvas.addGhost(action.params)

        // 第二层：执行
        const result = this.canvas.execute(action)

        // 第三层：语音确认
        await this.speak(this.getActionConfirmText(action, result))
    }

    /**
     * 动作确认文案（温柔版）
     */
    getActionConfirmText(action, result) {
        const templates = {
            draw_shape: [
                `好的，我已经在${action.params.position}画了一个${action.params.color}的${action.params.shape_type}`,
                `画好了，${action.params.color}的${action.params.shape_type}在${action.params.position}`,
                `完成啦，你可以在${action.params.position}看到${action.params.color}的${action.params.shape_type}了`,
            ],
            edit_shape: [
                `已经把${action.params.target_tag}修改好了`,
                `改好了，${action.params.target_tag}现在是新的样子了`,
            ],
            delete_shape: [
                `已经把${action.params.target_tag}删掉了`,
                `删除了，画布上少了一个图形`,
            ],
        }

        const options = templates[action.tool] || ['好的，完成了']
        return options[Math.floor(Math.random() * options.length)]
    }
}
```

### 4.2 画布状态管理（给 AI 用）

```javascript
class CanvasState {
    constructor() {
        this.objects = []
    }

    /**
     * 生成给 AI 的上下文描述
     */
    toContext() {
        if (this.objects.length === 0) {
            return '画布为空，没有任何图形。'
        }

        const descriptions = this.objects.map((obj, i) => {
            const pos = this.positionName(obj.position)
            const shape = this.shapeName(obj.shape)
            const tag = obj.tag ? `，叫"${obj.tag}"` : ''
            return `${pos}有一个${obj.color}的${shape}${tag}`
        })

        return `画布上有${this.objects.length}个图形：${descriptions.join('；')}。`
    }

    /**
     * 生成给视障用户的空间描述
     */
    describeForUser() {
        if (this.objects.length === 0) {
            return '画布上还没有任何图形。'
        }

        // 按空间方位分组描述
        const groups = { 上方: [], 下方: [], 左边: [], 右边: [], 中间: [] }
        this.objects.forEach(obj => {
            const region = this.getRegion(obj.position)
            groups[region].push(obj)
        })

        let desc = ''
        for (const [region, objs] of Object.entries(groups)) {
            if (objs.length > 0) {
                const items = objs.map(o => `${o.color}${this.shapeName(o.shape)}`).join('和')
                desc += `${region}有${items}；`
            }
        }

        return `画布上有${this.objects.length}个图形。${desc}`
    }
}
```

---

## 五、对话上下文管理

### 5.1 短期记忆（当前会话）

```python
class ConversationContext:
    """
    对话上下文管理
    保留最近 N 轮对话，供 LLM 理解指代关系
    """

    def __init__(self, max_turns=5):
        self.history = []
        self.max_turns = max_turns

    def add(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        # 保留最近 N 轮
        if len(self.history) > self.max_turns * 2:
            self.history = self.history[-self.max_turns * 2:]

    def get_messages(self, system_prompt: str, canvas_context: str):
        """构建给 LLM 的消息列表"""
        messages = [
            {"role": "system", "content": f"""{system_prompt}

当前画布状态：
{canvas_context}

你是一个温柔的绘画助手。每完成一个操作，用温和的语气告诉用户你做了什么。
如果用户说"它"、"刚才那个"，根据上下文推断指的是哪个图形。
回复简洁（<30字），口语化，不要用 Markdown。"""}
        ]
        messages.extend(self.history)
        return messages
```

### 5.2 长期记忆（用户偏好）

```python
class UserPreferences:
    """
    用户偏好记忆
    学习用户的习惯，提供个性化服务
    """

    def __init__(self):
        self.favorite_colors = {}      # 常用颜色
        self.favorite_shapes = {}      # 常用形状
        self.common_commands = []      # 常用指令
        self.preferred_position = None # 偏好位置

    def learn(self, command: str, params: dict):
        """从用户指令中学习偏好"""
        if 'color' in params:
            self.favorite_colors[params['color']] = \
                self.favorite_colors.get(params['color'], 0) + 1

        if 'shape_type' in params:
            self.favorite_shapes[params['shape_type']] = \
                self.favorite_shapes.get(params['shape_type'], 0) + 1

    def suggest(self) -> str:
        """基于偏好给出建议"""
        if self.favorite_colors:
            top_color = max(self.favorite_colors, key=self.favorite_colors.get)
            return f"你好像喜欢{top_color}色，要不要画一个{top_color}的图形？"
        return "想画点什么吗？"
```

---

## 六、语音播报策略

### 6.1 TTS 配置（小米 MiMo 温柔语音包）

```python
TTS_CONFIG = {
    "model": "mimo-v2.5-tts",
    "voice": "Chloe",  # 温柔女声
    "style": "Gentle, warm, caring, slow pace, like talking to a close friend",
    "speed": 0.9,  # 稍慢语速，让视障用户听清
}
```

### 6.2 播报时机

| 场景 | 播报内容 | 示例 |
|------|---------|------|
| 开场 | 欢迎语 + 画布状态 | "你好，我是小画。画布是空的，想画点什么吗？" |
| 执行完成 | 温柔确认 | "好的，已经画了一个红色的圆在中间" |
| 查询结果 | 生动描述 | "画布中间有一个红色的大圆，左上角有个蓝色的小方块" |
| 出错 | 安慰 + 引导 | "没关系，我没太听清，你能再说一次吗？" |
| 空闲关怀 | 主动询问 | "还在吗？需要帮忙吗？" |
| 撤销/清空 | 确认 | "好的，已经撤销了上一步" |
| 画布变化 | 通知 | "画布上现在有 5 个图形了" |

### 6.3 语气模板

```python
TONE_TEMPLATES = {
    "confirm": [
        "好的，{action}了。",
        "完成啦，{action}。",
        "已经{action}了哦。",
        "弄好了，{action}。",
    ],
    "error": [
        "没关系，{reason}，我们再试一次。",
        "出了点小问题，{reason}。",
        "抱歉，{reason}，你能再说一次吗？",
    ],
    "greeting": [
        "你好呀，我是小画。",
        "嗨，我在这里，随时帮你画画。",
    ],
    "idle_care": [
        "还在吗？需要帮忙吗？",
        "我在这里，随时告诉我你想画什么。",
        "画布上有{count}个图形，想修改什么吗？",
    ],
    "describe": [
        "让我看看...{description}",
        "画布上{description}",
    ],
}
```

---

## 七、鼠标 + 语音双通道

### 7.1 鼠标操作同步到 AI

```javascript
/**
 * 鼠标操作和语音操作共享同一个画布状态
 * 鼠标拖拽修改图形 → AI 能感知 → 语音播报变化
 */
canvas.addEventListener('objectModified', (e) => {
    // 更新画布状态
    canvasState.update(e.detail)

    // 通知 AI（不播报，静默更新）
    agent.notifyCanvasChange({
        type: 'mouse_edit',
        object: e.detail,
        context: canvasState.toContext()
    })
})

canvas.addEventListener('objectCreated', (e) => {
    canvasState.add(e.detail)

    // 鼠标创建的也要播报（温柔确认）
    agent.speak(`看到你画了一个${e.detail.color}的${e.detail.shape}，很好看`)
})
```

### 7.2 语音修改鼠标创建的图形

```javascript
// 用户用鼠标画了一个圆，然后用语音说"把它改成红色"
// AI 需要知道"它"指的是鼠标最后操作的图形

class InteractionTracker {
    constructor() {
        this.lastMouseTarget = null   // 鼠标最后选中的图形
        this.lastVoiceTarget = null   // 语音最后提到的图形
        this.lastCreated = null       // 最后创建的图形
    }

    /**
     * 解析指代词
     */
    resolveReference(text) {
        if (/它|这个|那个|刚才/.test(text)) {
            // 优先用鼠标最后操作的，其次语音最后提到的
            return this.lastMouseTarget || this.lastVoiceTarget || this.lastCreated
        }
        return null
    }
}
```

---

## 八、完整交互流程示例

```
用户：（打开页面）
小画：你好呀，我是小画，你的语音绘画助手。画布是空的，告诉我你想画什么吧。

用户：画一个红色的圆
小画：好的，已经在画布中间画了一个红色的圆。（画布显示红色圆，半透明→实体）

用户：在左上角画一个蓝色的大方块
小画：完成啦，蓝色的大方块在左上角。

用户：把它改成绿色
小画：已经把左上角的方块改成绿色了。

用户：看看画布上有什么
小画：画布上有 2 个图形。中间有一个红色的圆，左上角有一个绿色的大方块。

用户：（用鼠标拖拽圆到右边）
小画：（静默更新状态，不播报）

用户：刚才那个圆在哪
小画：红色的圆现在在画布右边。

用户：撤销
小画：好的，已经撤销了。

用户：（沉默 30 秒）
小画：还在吗？画布上有一个绿色的方块，想画点什么吗？

用户：清空画布
小画：好的，画布已经清空了。准备开始新的创作吧。

用户：帮我画一幅风景画
小画：好的，我来帮你画一幅风景。先画一片蓝天...
（AI 自动执行多步绘图，逐步播报）
小画：蓝天画好了。接下来画一座小山...
小画：小山在画布下方，是绿色的。再画一个太阳...
小画：完成了！画布上方有一个黄色的太阳，中间是蓝天，下方有绿色的山。
```

---

## 九、技术实现路线

### Phase 1：Agent 主循环（1-2天）
- [ ] 后端 WebSocket 永久连接
- [ ] Agent 状态机（idle → listening → processing → speaking）
- [ ] 空闲超时主动关怀
- [ ] 对话上下文管理

### Phase 2：温柔播报系统（1天）
- [ ] MiMo TTS 温柔语音包配置
- [ ] 播报时机管理（执行后、出错时、空闲时）
- [ ] 语气模板随机化
- [ ] 播报队列（不重叠）

### Phase 3：全双工语音（1天）
- [ ] VAD 语音活动检测
- [ ] Barge-in 打断（说话时停止播报）
- [ ] 增量 ASR 结果处理
- [ ] 快指令预判执行

### Phase 4：画布状态同步（1天）
- [ ] 鼠标操作 → AI 感知
- [ ] 语音操作 → 画布执行
- [ ] 指代词解析（"它"、"刚才那个"）
- [ ] 画布变化语音播报

### Phase 5：智能引导（1天）
- [ ] 用户偏好学习
- [ ] 主动建议
- [ ] 多步任务自动拆解
- [ ] 错误恢复引导

---

## 十、语音包选择

### 小米 MiMo TTS 可用语音包

| 语音包 | 风格 | 适用场景 |
|--------|------|---------|
| **Chloe** | 温柔女声 | 默认首选，温暖亲切 |
| **Bright** | 活泼女声 | 欢迎语、成功确认 |
| **Calm** | 平和男声 | 描述画布内容 |

### 推荐配置

```python
# 主播报（温柔女声）
TTS_PRIMARY = {
    "voice": "Chloe",
    "style": "Gentle, warm, caring, slow pace",
}

# 备播报（平和男声）
TTS_FALLBACK = {
    "voice": "Calm",
    "style": "Calm, steady, reassuring",
}
```

---

## 总结

这个系统的核心不是"语音控制画布"，而是**AI 陪伴创作**。

- AI 不等待指令，而是主动关怀
- AI 不报错，而是温柔引导
- AI 不沉默执行，而是每步确认
- AI 不只听语音，还看鼠标操作

最终目标：让视障或肢体障碍用户感受到，**不是在操作一个工具，而是在和一个温柔的朋友一起画画**。
