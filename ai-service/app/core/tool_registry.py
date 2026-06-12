"""
工具注册中心模块
采用注册中心模式，解耦工具定义与 Agent 逻辑
新增工具只需加 @ToolRegistry.register 装饰器
"""

from typing import Callable, Dict, List, Any
from langchain.tools import tool


class ToolRegistry:
    """
    工具注册中心

    使用方法：
        @ToolRegistry.register("tool_name")
        def my_tool(param: str) -> str:
            '''工具描述'''
            return "result"
    """

    _tools: Dict[str, Any] = {}

    @classmethod
    def register(cls, name: str):
        """
        注册工具装饰器

        Args:
            name: 工具名称，用于 Function Calling 识别

        Returns:
            装饰器函数
        """
        def decorator(func: Callable):
            # 使用 langchain 的 tool 装饰器包装
            cls._tools[name] = tool(func)
            return func
        return decorator

    @classmethod
    def get_tools(cls) -> List[Any]:
        """
        获取所有已注册的工具列表

        Returns:
            工具列表
        """
        return list(cls._tools.values())

    @classmethod
    def get_tool(cls, name: str) -> Any:
        """
        根据名称获取工具

        Args:
            name: 工具名称

        Returns:
            工具实例，不存在则返回 None
        """
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> List[str]:
        """
        获取所有已注册工具的名称列表

        Returns:
            工具名称列表
        """
        return list(cls._tools.keys())

    @classmethod
    def clear(cls):
        """清空所有注册的工具（用于测试）"""
        cls._tools.clear()
