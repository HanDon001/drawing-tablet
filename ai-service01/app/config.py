"""
集中配置 — 所有 API URL、模型名、Key 统一管理
"""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # ── 应用 ──
    APP_NAME: str = "VoiceCanvas-AI"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:5173"

    # ── DeepSeek LLM ──
    DEEPSEEK_API_KEY: str = Field(..., description="DeepSeek API Key")
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    LLM_MODEL: str = "deepseek-v4-flash"
    LLM_TIMEOUT: float = 8.0

    # ── DashScope（ASR + 图片） ──
    DASHSCOPE_API_KEY: str = Field(..., description="DashScope API Key")
    ASR_MODEL: str = "qwen3-asr-flash-realtime"
    ASR_REALTIME_URL: str = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
    IMAGE_MODEL: str = "flux-schnell"
    IMAGE_SUBMIT_URL: str = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
    IMAGE_RESULT_URL: str = "https://dashscope.aliyuncs.com/api/v1/tasks"

    # ── MiMo TTS ──
    MIMO_API_KEY: str = Field(..., description="MiMo API Key")
    MIMO_API_BASE: str = "https://token-plan-cn.xiaomimimo.com"
    TTS_MODEL: str = "mimo-v2.5-tts"
    TTS_VOICE: str = "Chloe"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
