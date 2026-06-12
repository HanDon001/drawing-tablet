# drawing-tablet

VoiceCanvas 纯语音绘图工具 - 一款绝对零物理交互的语音控制绘图应用

## 🎉 里程碑：语音对画布功能已实现

语音指令可以控制画布绘图，完成 MVP 核心功能。

### 功能演示

```
用户语音: "画一个红色的圆"
    ↓
ASR 识别 → AI 理解 → Canvas 渲染 → TTS 播报
    ↓
画布出现红色圆形，语音确认"已绘制图形"
```

### 支持的语音指令

| 指令 | 示例 |
|------|------|
| 绘制形状 | "画一个红色的圆"、"在左上角画一个蓝色方块" |
| 修改属性 | "把圆改成蓝色"、"把方块放大" |
| 删除图形 | "删除圆"、"去掉方块" |
| 查询画布 | "画布上有什么" |
| 撤销/清空 | "撤销"、"清空画布" |

## 特性

- 🎤 纯语音控制，无需鼠标键盘
- ♿ 无障碍设计，支持视障用户
- 🤖 AI驱动，理解自然语言指令
- 🎨 对象化绘图，支持编辑修改
- 💾 本地自动保存，刷新不丢失
- 🔗 全链路追踪，方便排查问题

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Pinia + Canvas API |
| 后端 | Python + FastAPI |
| 语音 | Web Speech API (ASR + TTS) |

## 快速开始

```bash
# 一键启动
start.bat

# 或手动启动
# 后端
cd ai-service && python run.py

# 前端
cd web && npm run dev
```

## 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:8000 |
| API文档 | http://localhost:8000/docs |

## 项目结构

```
口述画板/
├── ai-service/          # Python 后端服务
│   ├── app/
│   │   ├── main.py      # FastAPI 入口
│   │   ├── core/        # 核心模块（Agent、配置、日志）
│   │   ├── api/         # API 路由
│   │   └── skills/      # 技能模块（绘图、查询）
│   └── run.py           # 启动脚本
│
├── web/                 # Vue 3 前端
│   ├── src/
│   │   ├── api/         # API 调用
│   │   ├── components/  # Vue 组件
│   │   ├── composables/ # 组合式函数（语音服务）
│   │   ├── stores/      # Pinia 状态
│   │   └── utils/       # 工具函数（Canvas引擎）
│   └── package.json
│
├── start.bat            # Windows 启动脚本
├── start.sh             # Linux/Mac 启动脚本
└── *.md                 # 项目文档
```

## 文档

- [项目架构设计](项目架构设计.md) - PRD 需求规格
- [技术设计文档](TECH_DESIGN.md) - 技术架构
- [智能体设计](AGENTS.md) - Agent 设计
- [构建计划](BUILD.md) - 分阶段实现

## 开发历程

| Phase | 内容 | PR |
|-------|------|-----|
| Phase 0 | 工程化骨架搭建 | [#1](https://github.com/HanDon001/drawing-tablet/pull/1) |
| Phase 1 | Tool & Skill 编排 | [#2](https://github.com/HanDon001/drawing-tablet/pull/2) |
| Phase 2 | 闭环联调 | [#3](https://github.com/HanDon001/drawing-tablet/pull/3) |
| Phase 3 | 体验与韧性 | [#4](https://github.com/HanDon001/drawing-tablet/pull/4) |

## 许可证

MIT
