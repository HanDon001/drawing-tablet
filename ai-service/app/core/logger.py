"""
日志管理模块
使用 loguru 替代原生 logging，提供结构化日志、自动轮转、全链路追踪
"""

import sys
from loguru import logger
from .config import settings


def setup_logger():
    """
    配置 loguru 日志

    - 控制台输出：带颜色格式化
    - 文件输出：自动轮转，保留10天
    """
    # 移除默认处理器
    logger.remove()

    # 控制台输出 - 带颜色
    logger.add(
        sys.stderr,
        level=settings.LOG_LEVEL,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        colorize=True
    )

    # 文件输出 - 自动轮转
    logger.add(
        "logs/app_{time:YYYY-MM-DD}.log",
        level=settings.LOG_LEVEL,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        rotation="00:00",  # 每天午夜轮转
        retention="10 days",  # 保留10天
        compression="zip",  # 压缩旧日志
        encoding="utf-8"
    )

    logger.info(f"日志系统初始化完成，级别: {settings.LOG_LEVEL}")
    return logger


# 导出 logger 实例供其他模块使用
app_logger = setup_logger()
