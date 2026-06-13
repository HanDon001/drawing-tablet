"""
工具注册器 — 装饰器自动注册 + OpenAI Function Calling Schema 生成
"""

import inspect
from typing import Callable, Dict, Any, List


class ToolRegistry:
    _tools: Dict[str, Callable] = {}
    _descriptions: Dict[str, str] = {}
    _schemas: Dict[str, dict] = {}

    @classmethod
    def register(cls, name: str = None, description: str = ""):
        def decorator(func):
            tool_name = name or func.__name__
            cls._tools[tool_name] = func
            cls._descriptions[tool_name] = description or func.__doc__ or tool_name
            cls._schemas[tool_name] = cls._build_schema(tool_name, func, description)
            return func
        return decorator

    @classmethod
    def execute(cls, name: str, args: dict) -> str:
        func = cls._tools.get(name)
        if not func:
            return f"未知工具: {name}"
        try:
            result = func(**args)
            return str(result) if result else "已执行"
        except Exception as e:
            return f"执行错误: {e}"

    @classmethod
    def get_openai_tools(cls) -> List[dict]:
        return list(cls._schemas.values())

    @classmethod
    def list_tools(cls) -> List[str]:
        return list(cls._tools.keys())

    @classmethod
    def _build_schema(cls, name: str, func: Callable, description: str) -> dict:
        sig = inspect.signature(func)
        params = {}
        type_map = {str: "string", int: "integer", float: "number", bool: "boolean"}

        for param_name, param in sig.parameters.items():
            param_type = type_map.get(param.annotation, "string")
            param_info = {"type": param_type}
            if param.default is not inspect.Parameter.empty:
                param_info["default"] = param.default
            params[param_name] = param_info

        return {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": params,
                    "required": [p for p, v in sig.parameters.items() if v.default is inspect.Parameter.empty],
                },
            },
        }
