"""
VoiceCanvas AI Service - FastAPI 入口
CORS 配置、路由挂载、生命周期事件、异常捕获中间件
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import traceback

from .core.config import settings
from .api.v1.agent import router as agent_router
from .api.v1.voice import router as voice_router
from .api.v1.voice_ws import router as voice_ws_router
from .api.v1.agent_ws import router as agent_ws_router
from .api.v1.gateway_ws import router as gateway_router

# 导入 Skills 模块，确保工具被注册到 ToolRegistry
from .skills.draw import tools as draw_tools
from .skills.query import tools as query_tools


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


# 全局异常捕获中间件
@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    """全局异常捕获，记录日志并返回友好提示"""
    # 获取请求ID
    request_id = request.headers.get("X-Request-ID", "unknown")

    try:
        response = await call_next(request)
        return response
    except Exception as e:
        # 记录详细错误日志
        logger.error(f"[{request_id}] 未捕获异常: {str(e)}")
        logger.error(f"[{request_id}] 异常堆栈:\n{traceback.format_exc()}")

        # 返回友好提示，不暴露堆栈
        return JSONResponse(
            status_code=500,
            content={
                "detail": "服务器内部错误，请稍后重试",
                "request_id": request_id
            }
        )


# 请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """记录请求日志"""
    request_id = request.headers.get("X-Request-ID", "unknown")
    logger.info(f"[{request_id}] {request.method} {request.url.path}")

    response = await call_next(request)

    logger.info(f"[{request_id}] 响应状态: {response.status_code}")
    return response


# 挂载路由
app.include_router(agent_router)
app.include_router(voice_router)
app.include_router(voice_ws_router)
app.include_router(agent_ws_router)
app.include_router(gateway_router)


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": settings.APP_NAME,
        "version": "0.1.0",
        "status": "running"
    }
