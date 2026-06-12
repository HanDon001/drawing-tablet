"""
VoiceCanvas AI Service - FastAPI 入口
CORS 配置、路由挂载、生命周期事件
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from .core.config import settings
from .api.v1.agent import router as agent_router


# 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期事件"""
    # 启动时执行
    logger.info(f"🚀 {settings.APP_NAME} 启动中...")
    logger.info(f"📊 调试模式: {settings.DEBUG}")
    logger.info(f"🤖 LLM模型: {settings.LLM_MODEL}")
    logger.info(f"📝 日志级别: {settings.LOG_LEVEL}")

    yield

    # 关闭时执行
    logger.info(f"👋 {settings.APP_NAME} 正在关闭...")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    description="VoiceCanvas 纯语音绘图工具 - AI 服务",
    version="0.1.0",
    lifespan=lifespan
)

# CORS 中间件配置
# 将逗号分隔的字符串转换为列表
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由
app.include_router(agent_router)


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": settings.APP_NAME,
        "version": "0.1.0",
        "status": "running"
    }
