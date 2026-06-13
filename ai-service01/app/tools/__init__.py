"""工具包 — 自动注册所有工具"""

from .registry import ToolRegistry

# 导入工具模块触发 @ToolRegistry.register 装饰器
from . import draw_tools  # noqa: F401
from . import query_tools  # noqa: F401
