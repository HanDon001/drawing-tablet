"""
统一异常定义 + 错误处理
所有模块抛出自定义异常，main.py 统一捕获
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from loguru import logger


# ── 自定义异常 ──

class AppError(Exception):
    """应用基础异常"""
    def __init__(self, message: str, code: str = "APP_ERROR", status: int = 500):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(message)


class ASRError(AppError):
    """ASR 语音识别错误"""
    def __init__(self, message: str):
        super().__init__(message, code="ASR_ERROR", status=500)


class TTSError(AppError):
    """TTS 语音合成错误"""
    def __init__(self, message: str):
        super().__init__(message, code="TTS_ERROR", status=500)


class LLMError(AppError):
    """LLM 调用错误"""
    def __init__(self, message: str):
        super().__init__(message, code="LLM_ERROR", status=500)


class ImageError(AppError):
    """图片生成错误"""
    def __init__(self, message: str):
        super().__init__(message, code="IMAGE_ERROR", status=500)


class ConfigError(AppError):
    """配置错误"""
    def __init__(self, message: str):
        super().__init__(message, code="CONFIG_ERROR", status=500)


# ── 全局异常处理器 ──

async def app_error_handler(request: Request, exc: AppError):
    """处理自定义异常"""
    rid = request.headers.get("X-Request-ID", "?")
    logger.error(f"[{rid}] [{exc.code}] {exc.message}")
    return JSONResponse(
        status_code=exc.status,
        content={"error": exc.code, "message": exc.message, "request_id": rid},
    )


async def unhandled_error_handler(request: Request, exc: Exception):
    """处理未捕获异常"""
    rid = request.headers.get("X-Request-ID", "?")
    logger.exception(f"[{rid}] 未捕获异常: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "服务器内部错误", "request_id": rid},
    )
