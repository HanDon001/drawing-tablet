"""
配置中心模块
使用 pydantic-settings 统一管理环境变量，支持 .env 文件和运行时覆盖
"""

from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class AppSettings(BaseSettings):
    """应用配置"""

    # 应用基础配置
    APP_NAME: str = Field(default="VoiceCanvas-AI", description="应用名称")
    DEBUG: bool = Field(default=False, description="调试模式")

    # 通义千问配置
    DASHSCOPE_API_KEY: str = Field(..., description="通义千问API密钥")
    LLM_MODEL: str = Field(default="qwen-plus", description="LLM模型名称")

    # 日志配置
    LOG_LEVEL: str = Field(default="INFO", description="日志级别")

    # CORS配置
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173",
        description="允许的前端源，多个用逗号分隔"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# 全局配置实例
settings = AppSettings()
