# VoiceCanvas 纯语音绘图工具 — 技术设计文档 (工程化架构版)

## 一、系统架构设计原则

- **插件化**：绘图工具、大模型能力可插拔，通过注册机制管理。
- **技能化**：将复杂能力封装为 Skill，Agent 负责路由和编排。
- **可观测性**：全链路日志追踪，配置集中管理。
- **前后端分离**：前端专注渲染与交互闭环，后端专注认知与编排。

## 二、系统架构图

```text
┌─────────────────────────────────────────────┐
│               Browser (Vue3)                │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
│  │ASR/TTS  │  │ Canvas   │  │ LocalStore│  │
│  │Service  │  │ Engine   │  │ Service   │  │
│  └────┬────┘  └────▲─────┘  └───────────┘  │
│       │            │                        │
│       └─────┬──────┘                        │
│             │ Action JSON                   │
│  ┌──────────▼──────────────────────────┐    │
│  │        Core Controller              │    │
│  │ (Fast Path: Undo/Clear本地拦截)     │    │
│  └──────────┬──────────────────────────┘    │
└─────────────┼───────────────────────────────┘
              │ HTTP (REST)
┌─────────────▼───────────────────────────────┐
│          FastAPI AI Service :8000           │
│  ┌─────────────────────────────────────┐    │
│  │           Core Agent                │    │
│  │  (Router + Context Mgr + Executor)  │    │
│  └──┬──────────┬──────────────┬────────┘    │
│     │          │              │             │
│  ┌──▼───┐  ┌──▼─────┐  ┌────▼────┐        │
│  │Config│  │ Logger │  │ToolRegist│        │
│  │Center│  │  Center│  │  Center  │        │
│  └──────┘  └────────┘  └────┬────┘        │
│                             │              │
│  ┌──────────────────────────▼────────┐     │
│  │           Skill Manager           │     │
│  │  ┌──────────┐  ┌──────────────┐  │     │
│  │  │DrawSkill │  │ QuerySkill   │  │     │
│  │  └──────────┘  └──────────────┘  │     │
│  └──────────────────────────────────┘     │
└───────────────────────────────────────────┘
```

## 三、后端工程化规范 (Python)

### 3.1 配置管理

使用 `pydantic-settings` 统一管理环境变量和配置，支持 `.env` 文件和运行时覆盖。

```python
# config/settings.py
from pydantic_settings import BaseSettings

class AppSettings(BaseSettings):
    APP_NAME: str = "VoiceCanvas-AI"
    DEBUG: bool = False
    DASHSCOPE_API_KEY: str  # 必填
    LLM_MODEL: str = "qwen-plus"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list = ["http://localhost:5173"]

    class Config:
        env_file = ".env"
```

### 3.2 日志管理

使用 `loguru` 替代原生 logging，提供结构化日志、自动轮转、全链路追踪。

```python
# utils/logger.py
from loguru import logger
import sys

def setup_logger(level="INFO"):
    logger.remove()
    logger.add(sys.stderr, level=level, format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}")
    logger.add("logs/app_{time}.log", rotation="500 MB", retention="10 days")
```

### 3.3 工具管理

采用注册中心模式，解耦工具定义与 Agent 逻辑。新增工具只需加装饰器。

```python
# core/tool_registry.py
from langchain.tools import tool

class ToolRegistry:
    _tools = {}

    @classmethod
    def register(cls, name):
        def decorator(func):
            cls._tools[name] = tool(func)
            return func
        return decorator

    @classmethod
    def get_tools(cls):
        return list(cls._tools.values())
```

### 3.4 Skill 管理

Skill 是对 Tool 的高级封装，包含特定的 Prompt 策略和上下文处理逻辑。

```python
# core/skill_base.py
from abc import ABC, abstractmethod

class BaseSkill(ABC):
    @abstractmethod
    def get_prompt(self) -> str:
        """返回该技能专属的 System Prompt 片段"""
        
    @abstractmethod
    def get_tools(self) -> list:
        """返回该技能需要的工具列表"""
```

## 四、前端工程化规范 (Vue3)

### 4.1 绘图引擎

基于面向对象设计，所有图形继承自 `BaseShape`，支持属性diff和局部重绘。

```typescript
// 统一的动作执行器
class ActionExecutor {
  execute(action: Action, state: CanvasState) {
    switch(action.tool) {
      case 'draw_shape': return this.draw(action.params, state);
      // 扩展新工具只需加 case
    }
  }
}
```

### 4.2 配置管理

使用 `.env` 管理环境变量，Vite 注入。

```text
VITE_AI_API_BASE=/ai/v1
VITE_ASR_LANGUAGE=zh-CN
VITE_TTS_VOICE_NAME=Google 普通话
```
