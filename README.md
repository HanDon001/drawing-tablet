# drawing-tablet

VoiceCanvas 纯语音绘图工具 - 一款绝对零物理交互的语音控制绘图应用

## 特性

- 🎤 纯语音控制，无需鼠标键盘
- ♿ 无障碍设计，支持视障用户
- 🤖 AI驱动，理解自然语言指令
- 🎨 对象化绘图，支持编辑修改

## 技术栈

- **前端**: Vue 3 + Vite + Pinia + Canvas API
- **后端**: Python + FastAPI + LangChain
- **AI**: 通义千问 (Qwen) + Function Calling
- **语音**: Web Speech API (ASR + TTS)

## 快速开始

```bash
# 前端
cd web && npm install && npm run dev

# 后端
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload
```

## 文档

- [项目架构设计](项目架构设计.md)
- [技术设计文档](TECH_DESIGN.md)
- [智能体设计](AGENTS.md)
- [构建计划](BUILD.md)
