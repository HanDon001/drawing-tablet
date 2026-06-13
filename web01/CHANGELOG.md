# VoiceCanvas 前端迭代记录

## v2.0.0 — 工程化重构 (2026-06-13)

### 变更概述
将 `index.html` 从 2915 行的单体文件拆分为模块化工程结构，实现 CSS/JS 职责分离。

### 变更前
```
web01/
└── index.html (2915 行) — 包含所有 CSS、HTML、内联 JS
    └── js/ — 13 个 VC 模块（已有）
```

### 变更后
```
web01/
├── index.html (418 行) — 仅保留 HTML 标记 + script/css 引用
├── css/
│   └── main.css — 从 index.html 提取的所有样式 (~1600 行)
└── js/
    ├── vc.js, state.js, store.js, log.js — (已有) 基础设施
    ├── voice.js, companion.js — (已有) 语音通信
    ├── cmd.js — (已有) 命令执行器
    ├── canvas.js, drawing.js, vector.js — (已有) 画布引擎
    ├── viewport.js — (已有) 视口系统
    ├── ai_draw.js, ui.js — (已有) UI 控制
    ├── shape-renderer.js — 【新增】形状绘制 + 控制点 + 命中检测
    ├── canvas-interaction.js — 【新增】画布交互 (拖拽/缩放/旋转/右键菜单/图层)
    ├── chat.js — 【新增】聊天面板 (消息/发送/快捷命令)
    ├── speech.js — 【新增】语音识别 (Web Speech API)
    ├── local-commands.js — 【新增】本地命令回退
    ├── effects.js — 【新增】视觉效果 (彩虹转场/粒子/声波)
    ├── ai-mode.js — 【新增】AI 陪伴/多模态模式
    └── app.js — 【新增】应用入口 + 初始化
```

### 拆分明细

| 原内联代码 | 目标模块 | 主要函数 |
|-----------|---------|---------|
| drawShape/drawStar/drawPolygon/控制点/命中检测 | shape-renderer.js | VC.ShapeRenderer.* |
| 画布初始化/redrawAll/鼠标事件/右键菜单/图层 | canvas-interaction.js | VC.CanvasInteraction.* |
| addChat/sendChatMessage/快捷命令/输入框 | chat.js | VC.Chat.* |
| initRecognition/startListening/stopListening | speech.js | VC.Speech.* |
| processVoiceCommand + 形状/颜色映射 | local-commands.js | VC.LocalCommands.* |
| playSuperTransition/粒子/声波/模式指示器 | effects.js | VC.Effects.* |
| activateAIMode/deactivateAIMode/多模态 | ai-mode.js | VC.AIMode.* |
| initSwatches/工具栏/菜单/模块启动/演示 | app.js | VC.App.* |

### 关键设计决策

1. **全局兼容层**：每个新模块通过 `window.xxx = VC.Module.method` 暴露全局引用，保持 HTML 中 `onclick="xxx()"` 属性兼容
2. **加载顺序**：app.js 最后加载，依赖所有其他模块
3. **VC 命名空间**：所有新模块挂载到 `VC.*` 命名空间，遵循已有模式
4. **不修改已有模块**：vc.js, state.js, cmd.js 等 13 个已有模块保持不变

### 数据统计

| 指标 | 数值 |
|------|------|
| index.html 行数 | 2915 → 418 (-85.7%) |
| index.html 字符 | 134K → 27K (-80%) |
| 新增文件数 | 8 个 JS + 1 个 CSS |
| 新增代码行数 | ~1200 行 |

---

## v1.0.0 — 初始版本

- 单体 index.html，内联所有 CSS/JS
- 13 个 VC 模块 (IIFE + 全局命名空间)
