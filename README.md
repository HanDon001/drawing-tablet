# VoiceCanvas 口述画板

一款**纯语音控制**的绘图工具 — 零鼠标、零键盘、零触屏，仅凭语音完成艺术创作。

为肢体不便（高位截瘫、手部震颤）和视力障碍用户提供无障碍绘图能力。

## ✨ 核心特性

- 🎤 **纯语音控制** — 自然语言描述即可绘图，无需任何物理操作
- 🤖 **AI 理解** — DeepSeek LLM 理解复杂语义，自动选择正确工具
- ⚡ **实时流式 ASR** — DashScope WebSocket 语音识别，说话即识别
- 🎨 **矢量绘图** — 支持 9 种参数化矢量形状 + Fabric.js 精确控制
- ✏️ **批量编辑** — 按标签批量修改颜色、位置、大小、透明度、旋转
- 🔊 **TTS 反馈** — 每次操作后语音确认，视障用户的"眼睛"
- 💾 **本地保存** — 画布状态自动保存，刷新不丢失

## 🚀 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- DashScope API Key（语音识别 + TTS）
- DeepSeek API Key（LLM）

### 一键启动

```bash
# Windows
start.bat

# 或手动启动
# 后端
cd ai-service01
pip install -r requirements.txt
python run.py

# 前端（另一个终端）
cd web01
npm install
npm run dev
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |

## 🎯 语音指令

### 绘制

```
"画一个红色的圆"
"在左上角画一个蓝色方块"
"画一朵花"
"画一个星空主题"
```

### 编辑

```
"把所有星星变成黄色"
"把海洋移到画布下方"
"把圆形放大一倍"
"把矩形的透明度设为 50%"
"把三角形旋转 45 度"
```

### 删除

```
"删除太阳"
"去掉所有的星星"
"清空画布"
```

### 查询

```
"画布上有什么"
"选中刚才的圆"
```

### 撤销

```
"撤销"
```

## 🏗️ 项目结构

```
口述画板/
├── ai-service01/           # Python 后端
│   ├── app/
│   │   ├── main.py         # FastAPI 入口
│   │   ├── config.py       # 配置管理
│   │   ├── agent/          # AI Agent（路由 + ReAct 循环）
│   │   │   ├── planner.py  # LLM 路由 + 系统提示
│   │   │   ├── react.py    # ReAct 执行循环
│   │   │   └── executor.py # 工具执行器
│   │   ├── routers/        # API 路由
│   │   │   ├── agent.py    # /interpret 指令接口
│   │   │   ├── voice.py    # /voice/asr + /voice/tts
│   │   │   └── gateway_ws.py # WebSocket 陪伴模式
│   │   ├── services/       # 业务服务
│   │   │   ├── asr_service.py  # DashScope ASR
│   │   │   ├── llm_service.py  # DeepSeek LLM
│   │   │   └── tts_service.py  # DashScope TTS
│   │   ├── tools/          # 工具注册（30+ 工具）
│   │   └── schemas/        # 数据模型
│   └── requirements.txt
│
├── web01/                  # 前端（原生 JS + Fabric.js）
│   ├── js/
│   │   ├── cmd.js          # 命令执行器（工具路由 + 画布操作）
│   │   ├── companion.js    # AI 陪伴模式（WebSocket + VAD）
│   │   ├── speech.js       # 麦克风模式（Web Speech API）
│   │   ├── voice.js        # VAD 录音 + REST ASR
│   │   ├── vc.js           # 核心配置 + 颜色映射
│   │   ├── vector.js       # 矢量形状生成器（9 种）
│   │   ├── figma-tools.js  # Fabric.js 画布引擎
│   │   ├── ai-mode.js      # AI 模式切换
│   │   └── app.js          # 应用入口
│   ├── public/
│   │   └── vad-processor.js # VAD AudioWorklet
│   ├── index.html
│   └── package.json
│
├── PRD.md                  # 需求规格说明书
├── DESIGN.md               # 设计文档（问题追踪 + 技术决策）
└── start.bat               # 一键启动脚本
```

## 🛠️ 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端渲染 | Fabric.js | 画布操作、对象管理、图层排序 |
| 前端语音 | Web Speech API | 麦克风模式语音识别 |
| 前端 VAD | AudioWorklet | 语音活动检测（能量阈值 + hangover） |
| 后端框架 | FastAPI | REST + WebSocket API |
| ASR | DashScope WebSocket | 流式语音识别（实时 partial/final） |
| LLM | DeepSeek API | 意图理解、工具选择、参数生成 |
| TTS | DashScope TTS | 语音合成反馈 |
| 矢量化 | OpenCV / Pillow | 位图转 SVG 轮廓提取 |

## 🔄 数据流

```
┌──────────── 前端 ────────────┐     ┌──────────── 后端 ────────────┐
│                               │     │                               │
│  麦克风 → VAD → 音频流 ──────┼──→  │  WebSocket → ASR → 文字       │
│                               │     │                    ↓          │
│                               │     │  LLM Agent (ReAct 循环)       │
│                               │     │  route → think → execute      │
│                               │     │                    ↓          │
│  cmd.js ← 工具调用 ←─────────┼←──  │  JSON 响应（工具名 + 参数）    │
│    ↓                          │     │                               │
│  Fabric.js 画布渲染           │     └───────────────────────────────┘
│    ↓                          │
│  TTS 播报 ←───────────────────┼←──  语音合成
│                               │
└───────────────────────────────┘
```

## 📊 工具清单

### 绘制工具
| 工具 | 说明 |
|------|------|
| `draw_shape` | 绘制基础形状（圆/矩形/三角/星形等） |
| `inject_fabric_json` | 注入 Fabric.js JSON（精确控制每个属性） |
| `add_vector_shape` | 矢量形状（爱心/螺旋/齿轮/花朵等 9 种） |
| `draw_svg_path` | 绘制自定义 SVG 路径 |
| `search_icon_svg` | 搜索图标（Iconify API） |
| `ai_generate_image` | AI 生成图片（DashScope） |
| `generate_vector_art` | AI 生成矢量图（图片→SVG 转换） |

### 编辑工具
| 工具 | 说明 |
|------|------|
| `edit_shape` | 修改属性（颜色/大小/透明度/描边）— 按 tag 批量 |
| `move_shape` | 移动位置 — 按 tag 批量 |
| `resize_shape` | 调整大小 — 按 tag 批量 |
| `set_opacity` | 设置透明度 — 按 tag 批量 |
| `set_stroke` | 设置描边 — 按 tag 批量 |
| `rotate_shape` | 旋转 — 按 tag 批量 |
| `reorder_layer` | 图层排序（置顶/置底/上移/下移） |
| `fill_area` | 填充颜色 |

### 删除工具
| 工具 | 说明 |
|------|------|
| `delete_by_tag` | 按标签批量删除 |
| `delete_shape` | 删除指定图形 |
| `delete_all` | 清空画布 |

### 查询工具
| 工具 | 说明 |
|------|------|
| `list_shapes` | 列出所有图形 |
| `describe_canvas` | 描述画布状态 |
| `get_shape_info` | 获取图形详情 |

### 其他
| 工具 | 说明 |
|------|------|
| `undo` / `redo` | 撤销 / 重做 |
| `save_as_png` / `save_as_svg` | 保存导出 |
| `group_objects` / `ungroup_objects` | 编组 / 解组 |

## 📖 文档

- [PRD 需求规格](PRD.md) — 功能需求与用户场景
- [设计文档](DESIGN.md) — 问题追踪、技术决策、实现状态

## 📄 许可证

MIT
