"""
VoiceCanvas AI Service — FastAPI 入口
路由挂载 + 中间件 + 统一异常处理
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from .config import settings
from .exceptions import (
    AppError, app_error_handler, unhandled_error_handler,
)

# 触发工具注册
from . import tools  # noqa: F401

# 路由
from .routers.agent import router as agent_router
from .routers.voice import router as voice_router
from .routers.gateway_ws import router as gateway_router
from .routers.image import router as image_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"[MAIN] {settings.APP_NAME} 启动")
    logger.info(f"[MAIN] LLM: {settings.LLM_MODEL} | ASR: {settings.ASR_MODEL} | TTS: {settings.TTS_MODEL}")
    yield
    logger.info(f"[MAIN] {settings.APP_NAME} 关闭")


app = FastAPI(title=settings.APP_NAME, version="0.2.0", lifespan=lifespan)

# ── 异常处理 ──
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

# ── CORS ──
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


# ── 请求日志中间件 ──
@app.middleware("http")
async def log_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID", "?")
    logger.info(f"[REQ] [{rid}] {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"[RES] [{rid}] {response.status_code}")
    return response


# ── 路由 ──
app.include_router(agent_router)
app.include_router(voice_router)
app.include_router(gateway_router)
app.include_router(image_router)


@app.get("/")
async def root():
    return {"service": settings.APP_NAME, "version": "0.2.0", "status": "running"}


@app.get("/health")
@app.get("/ai/v1/health")
async def health():
    return {"status": "ok"}
