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

---

## 🧠 核心架构：ReAct 循环

项目采用 **ReAct（Reasoning + Acting）** 模式，LLM 在"思考"和"行动"之间循环，直到任务完成。

```
用户语音: "画一个红色的圆，然后移到左边"
                    ↓
            ┌─── ReAct 循环 ───┐
            │                   │
  第1轮 →   │  think: 画圆      │ → execute: draw_shape(circle, red)
            │                   │
  第2轮 →   │  think: 移到左边  │ → execute: move_shape(circle, left)
            │                   │
  第3轮 →   │  think: 完成      │ → reply: "画好了"
            │                   │
            └───────────────────┘
                    ↓
            画布渲染 + TTS 播报
```

### 三层路由系统

在 LLM 决策之前，系统通过**关键词拦截**快速路由到正确的工具组：

```
Layer 0: 知名图标关键词 → search_icon_svg（Iconify API）
    ↓ 不匹配
Layer 1: 图片生成关键词 → ai_generate_image（DashScope 生图）
    ↓ 不匹配（但先检查编辑意图，编辑优先）
Layer 2: 编辑/删除关键词 → edit 工具组（19 个工具）
    ↓ 不匹配
Layer 3: LLM 自主决策 → ReAct 循环
```

**路由分组：**

| 分组 | 关键词示例 | 工具集 | 排他性 |
|------|-----------|--------|--------|
| `create` | 画、绘制、创建 | draw_shape, inject_fabric_json | 否 |
| `edit` | 改、修改、移动、变色、删除 | edit_shape, move_shape, delete_by_tag 等 19 个 | 否 |
| `delete` | 删、删除、清空、去掉 | delete_shape, delete_by_tag, delete_all | 是（排除 create/edit） |
| `vector` | 心形、螺旋、波浪、花朵、树 | add_vector_shape | 是（排除 create） |
| `vector_gen` | 矢量图、插画、图表 | inject_fabric_json | 是（排除 create/vector） |
| `image_gen` | 猫咪、风景、油画、3D、写实 | ai_generate_image | 是（排除 create/vector_gen） |
| `query` | 看看、有什么、列出 | list_shapes, describe_canvas | 否 |

### 工具执行流程

```python
# ReAct 循环（最多 5 轮）
for round in range(1, 6):
    msg, tool_calls = await planner.think(messages, tool_groups)  # LLM 思考

    if not tool_calls:  # 无工具调用 → 结束
        reply = extract_reply(msg)
        break

    actions = await executor.run_batch(tool_calls)  # 执行工具
    messages.extend(tool_messages)  # 将结果反馈给 LLM
```

**空响应重试**：LLM 偶尔返回空响应时，自动重试一次，用户无感知。

**连续错误保护**：连续 3 次工具执行错误时，自动中断并提示用户换种方式描述。

---

## 🎨 画布层级系统

基于 **Fabric.js** 构建的 Figma 级画布引擎，支持完整的图层管理和对象操作。

### 画布架构

```
┌─────────────────────────────────────────┐
│              Fabric.js Canvas            │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  对象栈（Z轴从底到顶）              │ │
│  │                                     │ │
│  │  [0] 星空背景 (rect)                │ │
│  │  [1] 海洋 (rect + ellipse)          │ │
│  │  [2] 月亮 (circle × 7)              │ │
│  │  [3] 星星 (circle × 20)             │ │ ← 最顶层
│  │                                     │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  每个对象属性:                            │
│  ├── id: 唯一标识                        │
│  ├── tag: 用户可读标签（如"星星"）       │
│  ├── type: rect/circle/ellipse/text/...  │
│  ├── left/top: 位置（像素，左上角原点）   │
│  ├── width/height: 尺寸                  │
│  ├── fill: 填充颜色                      │
│  ├── stroke/strokeWidth: 描边            │
│  ├── opacity: 透明度 (0-1)               │
│  ├── angle: 旋转角度                     │
│  ├── scaleX/scaleY: 缩放                 │
│  └── originX/originY: 定位原点 (left/top)│
│                                          │
└─────────────────────────────────────────┘
```

### 图层操作（VCLayer）

| 操作 | 方法 | 语音指令 |
|------|------|----------|
| 置顶 | `canvas.bringToFront(obj)` | "把海洋放到最上面" |
| 置底 | `canvas.sendToBack(obj)` | "把海洋放到最下面" |
| 上移一层 | `canvas.bringForward(obj)` | "把海洋上移一层" |
| 下移一层 | `canvas.sendBackwards(obj)` | "把海洋下移一层" |
| 组内上移 | 手动操作 `_objects` 数组 | 编组内部调整 |
| 组内下移 | 手动操作 `_objects` 数组 | 编组内部调整 |

### Tag 系统（核心设计）

每个画布对象都有一个 `tag` 属性（如 "星星"、"海洋"、"太阳"），这是语音编辑的唯一标识：

```
用户: "把所有星星变成黄色"
  ↓
LLM: edit_shape(target_tag="星星", new_color="黄")
  ↓
前端: objs.filter(o => o.tag && o.tag.includes("星星"))
  ↓
批量修改所有匹配对象的颜色
```

**Tag 规则：**
- LLM 创建对象时**必须**设置 tag（prompt 中 ★★★ 强调）
- 编辑/删除操作通过 tag 批量匹配
- 空 tag 对象不会被 `deleteByTag` 删除（安全过滤）
- 复杂图形（如太阳）由多个子对象组成，共享同一个 tag

### 坐标系统

```
(0,0) ─────────────────── (W,0)
  │                          │
  │      画布坐标系          │
  │      单位: 像素          │
  │      原点: 左上角        │
  │      originX: left       │
  │      originY: top        │
  │                          │
(0,H) ─────────────────── (W,H)

圆形定位: left = 圆心X - radius
          top  = 圆心Y - radius
```

**九宫格位置映射：**

| 位置名称 | 坐标 (相对画布) |
|----------|----------------|
| left_top | (25%, 25%) |
| top | (50%, 25%) |
| right_top | (75%, 25%) |
| left | (25%, 50%) |
| center | (50%, 50%) |
| right | (75%, 50%) |
| left_bottom | (25%, 75%) |
| bottom | (50%, 75%) |
| right_bottom | (75%, 75%) |

---

## 🎤 语音交互

### 两种模式

| 模式 | 触发方式 | ASR 引擎 | 特点 |
|------|----------|----------|------|
| 麦克风模式 | 点击麦克风按钮 | Web Speech API | 简单直接，浏览器内置 |
| AI 陪伴模式 | 点击 AI 模式按钮 | DashScope WebSocket | 流式识别，实时 partial 结果，支持打断 |

### AI 陪伴模式状态机

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
    ┌───────┐  说话   ┌──────────┐  说完  ┌───────────┐
    │ IDLE  │ ──────→ │ LISTENING│ ─────→ │ PROCESSING│
    └───────┘         └──────────┘        └───────────┘
        ▲                                      │
        │            ┌──────────┐              │
        └─────────── │ SPEAKING │ ←────────────┘
                     └──────────┘  AI 回复 + TTS
                          │
                          │ 用户开口（打断）
                          ▼
                     ┌──────────┐
                     │ LISTENING│
                     └──────────┘
```

**打断机制**：TTS 播放时检测到用户开口（能量 > 0.01），立即停止播报，切换到 LISTENING。

**主动搭话**：IDLE 状态超过 20 秒，AI 主动发起对话引导用户继续创作。

**VAD 参数**：
- 能量阈值：0.02（过滤环境噪音）
- Hangover：1.5 秒（适配中文语音停顿习惯）

---

## 🚀 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- DashScope API Key（语音识别 + TTS）
- DeepSeek API Key（LLM）

### 配置

在 `ai-service01/.env` 中配置：

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

DASHSCOPE_API_KEY=sk-xxx
ASR_MODEL=paraformer-realtime-v2
TTS_MODEL=cosyvoice-v2
TTS_VOICE=Chloe
```

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

---

## 🎯 语音指令

### 绘制

```
"画一个红色的圆"
"在左上角画一个蓝色方块"
"画一朵花"                    → 矢量花模板
"画一个星空主题"              → 预设主题
"用 AI 画一只猫咪"            → AI 生图
```

### 编辑（按 tag 批量操作）

```
"把所有星星变成黄色"
"把海洋移到画布下方"
"把圆形放大一倍"
"把矩形的透明度设为 50%"
"把三角形旋转 45 度"
"给海洋换个颜色"
```

### 图层排序

```
"把海洋置顶"
"把星星放到最下面"
"把月亮上移一层"
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

---

## 🏗️ 项目结构

```
口述画板/
├── ai-service01/           # Python 后端
│   ├── app/
│   │   ├── main.py         # FastAPI 入口
│   │   ├── config.py       # 配置管理（从 .env 读取）
│   │   │
│   │   ├── agent/          # 🧠 AI Agent 核心
│   │   │   ├── planner.py  #   路由系统 + 系统提示 + LLM 调用
│   │   │   ├── react.py    #   ReAct 循环（think → execute → repeat）
│   │   │   └── executor.py #   工具执行器 + 质量守门
│   │   │
│   │   ├── routers/        # 🌐 API 路由
│   │   │   ├── agent.py    #   POST /interpret（指令接口）
│   │   │   ├── voice.py    #   POST /voice/asr + /voice/tts
│   │   │   ├── gateway_ws.py # WebSocket /gateway（陪伴模式）
│   │   │   └── image.py    #   图片生成接口
│   │   │
│   │   ├── services/       # ⚙️ 业务服务
│   │   │   ├── asr_service.py  # DashScope 流式 ASR
│   │   │   ├── llm_service.py  # DeepSeek LLM 调用
│   │   │   ├── tts_service.py  # DashScope TTS
│   │   │   ├── image_service.py # 图片生成
│   │   │   └── vectorize_service.py # 位图→SVG 转换
│   │   │
│   │   ├── tools/          # 🔧 工具注册（30+ 工具）
│   │   │   ├── registry.py #   工具注册表 + OpenAI Function Calling
│   │   │   ├── shape_tools.py  # 绘制工具
│   │   │   ├── edit_tools.py   # 编辑工具
│   │   │   ├── fabric_tools.py # Fabric.js JSON 注入
│   │   │   ├── vector_tools.py # 矢量形状
│   │   │   ├── vector_gen_tools.py # AI 矢量生成
│   │   │   ├── icon_tools.py   # 图标搜索（Iconify）
│   │   │   ├── query_tools.py  # 画布查询
│   │   │   ├── control_tools.py # 画笔/工具切换
│   │   │   └── other_tools.py  # AI 生图/主题等
│   │   │
│   │   └── schemas/        # 数据模型
│   │       ├── canvas.py   #   画布相关 schema
│   │       └── voice.py    #   语音相关 schema
│   └── requirements.txt
│
├── web01/                  # 前端（原生 JS + Fabric.js）
│   ├── js/
│   │   ├── cmd.js          # 🎯 命令执行器（40+ 工具路由 + 画布操作）
│   │   ├── companion.js    # 🤖 AI 陪伴模式（WebSocket + VAD + TTS）
│   │   ├── speech.js       # 🎤 麦克风模式（Web Speech API）
│   │   ├── voice.js        # 🔊 VAD 录音 + REST ASR
│   │   ├── vc.js           # ⚙️ 核心配置 + 颜色映射
│   │   ├── vector.js       # 🌀 矢量形状生成器（9 种参数化曲线）
│   │   ├── figma-tools.js  # 🖼️ Fabric.js 画布引擎（VCTools + VCLayer）
│   │   ├── fabric-engine.js # 🖼️ Fabric.js 底层引擎（备用）
│   │   ├── ai-mode.js      # 🔄 AI 模式切换
│   │   ├── ai_draw.js      # 🎨 AI 绘图模式
│   │   ├── state.js        # 📦 状态管理（历史栈、对象列表）
│   │   ├── canvas-interaction.js # 🖱️ 画布交互（缩放、平移）
│   │   ├── viewport.js     # 🔍 视口管理
│   │   └── app.js          # 🚀 应用入口
│   ├── public/
│   │   └── vad-processor.js # 🎙️ VAD AudioWorklet（能量检测 + hangover）
│   ├── css/
│   │   └── main.css        # 样式
│   ├── index.html          # 主页面
│   ├── about.html          # 关于页面
│   └── package.json
│
├── PRD.md                  # 📋 需求规格说明书
├── DESIGN.md               # 📐 设计文档（问题追踪 + 技术决策）
├── README.md               # 📖 本文件
└── start.bat               # 🚀 一键启动脚本
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端渲染 | Fabric.js 5.3 | 画布操作、对象管理、图层排序、编组 |
| 前端语音 | Web Speech API | 麦克风模式语音识别 |
| 前端 VAD | AudioWorklet | 语音活动检测（能量阈值 0.02 + hangover 1.5s） |
| 后端框架 | FastAPI | REST + WebSocket API |
| ASR | DashScope WebSocket | 流式语音识别（实时 partial/final） |
| LLM | DeepSeek API | ReAct 循环中的意图理解 + 工具选择 |
| TTS | DashScope TTS | 语音合成反馈（cosyvoice-v2） |
| 矢量化 | OpenCV / Pillow | 位图转 SVG 轮廓提取 |
| 图标库 | Iconify API | 200,000+ 图标搜索 |

---

## 📊 工具清单（30+）

### 绘制工具
| 工具 | 说明 |
|------|------|
| `draw_shape` | 绘制基础形状（圆/矩形/三角/星形/菱形/箭头/六边形/直线） |
| `inject_fabric_json` | 注入 Fabric.js JSON（精确控制每个属性，支持复杂组合图形） |
| `add_vector_shape` | 矢量形状（爱心/螺旋/波浪/齿轮/树/云/闪电/花朵/箭头曲线） |
| `draw_svg_path` | 绘制自定义 SVG 路径 |
| `search_icon_svg` | 搜索图标（Iconify API，200,000+ 图标） |
| `ai_generate_image` | AI 生成图片（DashScope 图片生成） |
| `generate_vector_art` | AI 生成矢量图（图片→SVG 转换） |

### 编辑工具（全部支持按 tag 批量操作）
| 工具 | 说明 |
|------|------|
| `edit_shape` | 修改属性（颜色/大小/透明度/描边/标签） |
| `move_shape` | 移动位置（绝对坐标或九宫格位置） |
| `resize_shape` | 调整大小 |
| `set_opacity` | 设置透明度 (0-1) |
| `set_stroke` | 设置描边（颜色 + 粗细） |
| `rotate_shape` | 旋转（角度，正数顺时针） |
| `reorder_layer` | 图层排序（置顶/置底/上移一层/下移一层） |
| `fill_area` | 填充颜色 |

### 删除工具
| 工具 | 说明 |
|------|------|
| `delete_by_tag` | 按标签批量删除（空 tag 安全过滤） |
| `delete_shape` | 删除指定图形 |
| `delete_all` | 清空画布 |

### 查询工具
| 工具 | 说明 |
|------|------|
| `list_shapes` | 列出所有图形（tag/类型/位置/颜色） |
| `describe_canvas` | 描述画布状态（供 LLM 理解上下文） |
| `get_shape_info` | 获取单个图形详情 |

### 其他工具
| 工具 | 说明 |
|------|------|
| `undo` / `redo` | 撤销 / 重做 |
| `save_as_png` / `save_as_svg` | 保存导出 |
| `group_objects` / `group_by_tag` | 编组（选中对象 / 按标签） |
| `ungroup_objects` | 解散编组 |
| `select_shape` | 选中图形 |
| `duplicate_shape` | 复制图形 |
| `set_active_tool` | 切换工具（select/rect/circle/...） |
| `set_brush_params` | 设置画笔参数 |
| `draw_freehand_path` | 自由绘制路径 |
| `pen_draw` | 钢笔绘制 |

---

## 📖 文档

- [PRD 需求规格](PRD.md) — 功能需求、用户场景、交互流程
- [设计文档](DESIGN.md) — 问题追踪、技术决策、实现状态、未完成功能

---

## 📄 许可证

MIT
