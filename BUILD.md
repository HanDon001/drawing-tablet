# VoiceCanvas 纯语音绘图工具 — 工程化实现和迭代

## 迭代总览

| Phase | 名称 | 描述 |
|-------|------|------|
| Phase 0 | 工程化骨架搭建 | 规范先行，双端跑通 |
| Phase 1 | Tool&Skill 编排 | 核心能力模块化开发 |
| Phase 2 | 闭环联调 | 语音到画布的实时流转 |
| Phase 3 | 体验与韧性 | 视障辅助、降级与日志 |

---

## Phase 0: 工程化骨架搭建

**目标**：按工程化规范搭好前后端骨架，配置中心与日志中心就绪。

### 0.1 AI服务后端骨架

给AI的Prompt：

请使用 FastAPI 搭建工程化的 Python 后端骨架：

1. 初始化项目：`pip install fastapi uvicorn langchain langchain-community dashscope pydantic-settings loguru python-dotenv`

2. 创建目录结构：

```
ai-service/
├── app/
│   ├── main.py              # FastAPI 入口，CORS，路由挂载
│   ├── core/                # 核心架构
│   │   ├── config.py        # Pydantic Settings 配置中心
│   │   ├── logger.py        # Loguru 日志配置
│   │   ├── tool_registry.py # 工具注册器
│   │   └── skill_base.py    # 技能基类
│   ├── api/                 # API路由
│   │   └── v1/agent.py      # /interpret 接口
│   └── skills/              # 技能目录(暂时留空)
├── .env                     # DASHSCOPE_API_KEY=xxx, LOG_LEVEL=DEBUG
└── requirements.txt
```

3. 实现 `core/config.py`：使用 BaseSettings 读取环境变量。
4. 实现 `core/logger.py`：封装 loguru，请求进入时打印 info，异常时打印 error。
5. 实现 `core/tool_registry.py` 和 `core/skill_base.py`（按照 TECH_DESIGN.md 中的代码）。
6. 确保 `uvicorn app.main:app --reload` 能启动，且日志输出正常。

### 0.2 前端骨架

给AI的Prompt：

请使用 Vue3+Vite+Pinia 搭建前端骨架：

1. 创建目录：`web/src/{api,assets,components,composables,stores,utils,views,config}`
2. 创建 `config/index.ts`：集中管理 VITE 环境变量。
3. 创建 `utils/logger.ts`：封装 console.log，支持 Debug/Info/Error 级别，生产环境忽略 Debug。
4. 创建 `stores/canvasStore.ts`：定义 Object 接口和基础 State。
5. 创建 `App.vue`：全屏 Canvas + 右下角麦克风按钮。
6. 确保项目能启动。

**✅ 完成标准**：双端启动，配置中心和日志中心生效。

**📌 Git提交**：`git commit -m "Phase 0: 工程化双端骨架搭建"`

---

## Phase 1: Tool & Skill 编排开发

**目标**：开发具体的 Tool 和 Skill，并在 AI 服务中组装 Agent。

### 1.1 后端 Tool 与 Skill 开发

给AI的Prompt：

请在 `ai-service/app/skills/` 下开发绘图与查询能力：

1. 创建 `skills/draw/tools.py`：使用 `@ToolRegistry.register` 实现 `draw_shape`, `edit_shape`, `delete_shape` (参数按 AGENTS.md)。
2. 创建 `skills/draw/skill.py`：实现 DrawSkill，返回绘图 Prompt 和工具列表。
3. 创建 `skills/query/tools.py`：实现 `describe_canvas` 工具。
4. 创建 `skills/query/skill.py`：实现 QuerySkill，返回查询 Prompt 和工具列表。

### 1.2 Agent 核心调度器开发

给AI的Prompt：

请开发 Agent 调度核心，整合通义千问与 Skill：

1. 安装：`pip install langchainhub`
2. 创建 `core/agent.py`：
   - 初始化通义千问模型 (`ChatTongyi` from langchain_community.chat_models)。
   - 实现 `chat` 方法：
     - a. 根据 request 中的文本简单路由（如包含"有什么"选择 QuerySkill，否则选择 DrawSkill）。
     - b. 获取 Skill 对应的 Prompt 和 Tools。
     - c. 使用 `create_tool_calling_agent` 和 `AgentExecutor` 创建执行器。
     - d. 执行并捕获结果，解析出 `reply` 文本和 `actions` 工具调用参数列表。
3. 修改 `api/v1/agent.py`：
   - 接收 POST 请求 `{ text, canvas_context }`
   - 调用 `agent.chat()`
   - 返回 `{ reply, actions }`

**✅ 完成标准**：通过 Postman/curl 发送"画个圆"，AI 服务能正确返回 JSON 结构。

**📌 Git提交**：`git commit -m "Phase 1: Tool&Skill 体系与 Agent 调度核心完成"`

---

## Phase 2: 闭环联调 (语音->画布)

**目标**：打通前端 ASR -> 后端 Agent -> 前端 Canvas -> TTS 的完整链路。

### 2.1 前端 Canvas 渲染引擎

给AI的Prompt：

请实现前端绘图引擎：

1. 创建 `utils/canvasEngine.ts`：
   - 维护 `positionMap` 和 `sizeMap` 映射表。
   - 实现 ActionExecutor 类，根据 `action.tool` 和 `action.params` 调用 canvas API 绘制图形。
   - 支持局部渲染优化（如果能力允许，否则全量重绘）。
2. 在 canvasStore 中集成 ActionExecutor，当 actions 传入时自动执行并更新 state。

### 2.2 语音服务与全链路串联

给AI的Prompt：

请串联整个闭环：

1. 创建 `composables/useVoice.ts`：封装 ASR (webkitSpeechAPI) 和 TTS (speechSynthesis)。
2. 在 App.vue 中实现流转逻辑：
   - 麦克风点击 -> ASR 开启。
   - ASR 返回文本 ->
     - a. 快通道拦截：包含"撤销/清空"则本地执行并 TTS。
     - b. 慢通道：调用 `axios.post('/ai/v1/interpret', { text, canvas_context: "空" })`。
   - 收到响应 -> 执行 actions -> 更新 Canvas -> 调用 TTS 播报 reply。
3. 添加 Loading 状态：慢通道请求期间，麦克风按钮显示 Loading 动画，禁止重复输入。

**✅ 完成标准**：对着麦克风说"画个红色的圆"，画布出现红圆，并听到语音确认。

**📌 Git提交**：`git commit -m "Phase 2: 语音-认知-渲染-播报闭环跑通"`

---

## Phase 3: 体验、韧性与视障辅助

**目标**：完善视障查询，增加本地保存，提升系统容错率。

### 3.1 视障查询闭环

给AI的Prompt：

请完善视障用户的查询体验：

1. 前端在发送 `/interpret` 请求前，将 canvasStore 中的图形数组转化为自然语言描述，填入 `canvas_context` 字段（例如："画布中间有一个红色大圆(tag=太阳)"）。
2. 确保当用户说"画布上有什么"时，AI 能触发 `describe_canvas` 工具，并基于 `canvas_context` 生成空间方位描述回复。

### 3.2 本地持久化

给AI的Prompt：

请实现画作的本地自动保存：

1. 在 canvasStore 中添加 `saveToLocal` 和 `loadFromLocal` 方法，使用 localStorage。
2. 使用 watch 监听 state 变化，防抖 2 秒后自动保存。
3. 页面初始化时自动加载历史画作。

### 3.3 韧性与日志强化

给AI的Prompt：

请强化系统的容错与可观测性：

1. 后端中间件：在 FastAPI 中添加异常捕获中间件，所有未处理异常统一记录 `loguru.error`，并返回前端友好提示，不暴露堆栈。
2. 前端容错：校验 AI 返回的 actions 格式，若 shape_type 不支持，丢弃并 TTS 报错。
3. 前端降级：AI 请求超时(>5s) 时，TTS 提示"网络开小差了"。
4. 全链路追踪：前端在请求头加上 `X-Request-ID`，后端在日志中统一输出，方便定位问题。

**✅ 完成标准**：查询有声音反馈，刷新页面画作不丢失，异常情况有友好语音提示。

**📌 Git提交**：`git commit -m "Phase 3: 视障辅助、持久化与工程韧性打磨完成，MVP发布"`
