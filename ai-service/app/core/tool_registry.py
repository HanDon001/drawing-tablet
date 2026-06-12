"""
工具注册中心模块
采用注册中心模式，解耦工具定义与 Agent 逻辑
新增工具只需加 @ToolRegistry.register 装饰器
支持自动生成 OpenAI Function Calling JSON Schema
"""

import inspect
from typing import Callable, Dict, List, Any, Optional, get_type_hints


# Python 类型到 JSON Schema 类型的映射
_TYPE_MAP = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
}


def _python_type_to_json_schema(tp) -> str:
    """将 Python 类型注解转换为 JSON Schema type"""
    # 处理 Optional[X] (即 Union[X, None])
    origin = getattr(tp, "__origin__", None)
    if origin is Optional or (origin is type(None)):
        args = getattr(tp, "__args__", ())
        if args and args[0] is not type(None):
            return _TYPE_MAP.get(args[0], "string")

    return _TYPE_MAP.get(tp, "string")


def _build_parameters_schema(func: Callable) -> Dict[str, Any]:
    """
    从函数签名自动生成 JSON Schema parameters

    Args:
        func: 工具函数

    Returns:
        OpenAI function calling 的 parameters JSON Schema
    """
    sig = inspect.signature(func)
    try:
        hints = get_type_hints(func)
    except Exception:
        hints = {}

    properties = {}
    required = []

    for name, param in sig.parameters.items():
        # 获取类型
        tp = hints.get(name, str)
        json_type = _python_type_to_json_schema(tp)

        prop: Dict[str, Any] = {"type": json_type}

        # 从 docstring 中提取参数描述
        doc = func.__doc__ or ""
        desc = _extract_param_doc(doc, name)
        if desc:
            prop["description"] = desc

        # 处理默认值
        if param.default is not inspect.Parameter.empty:
            prop["default"] = param.default
        else:
            required.append(name)

        properties[name] = prop

    schema: Dict[str, Any] = {
        "type": "object",
        "properties": properties,
    }
    if required:
        schema["required"] = required

    return schema


def _extract_param_doc(doc: str, param_name: str) -> str:
    """从 docstring 中提取指定参数的描述"""
    if not doc:
        return ""

    lines = doc.strip().split("\n")
    in_args = False

    for line in lines:
        stripped = line.strip()

        # 检测 Args: 或 Parameters: 段落
        if stripped.lower().startswith("args:") or stripped.lower().startswith("parameters:"):
            in_args = True
            continue

        # 遇到新的段落（如 Returns:）停止
        if in_args and stripped and not stripped.startswith("-") and stripped.endswith(":") and not stripped.startswith(" "):
            in_args = False
            continue

        if in_args:
            # 匹配 "param_name: 描述" 或 "- param_name: 描述"
            for prefix in [f"{param_name}:", f"- {param_name}:"]:
                if stripped.startswith(prefix):
                    return stripped[len(prefix):].strip()

    return ""


class ToolRegistry:
    """
    工具注册中心

    使用方法：
        @ToolRegistry.register("tool_name")
        def my_tool(param: str) -> str:
            '''工具描述'''
            return "result"

    查询已注册工具：
        ToolRegistry.get_openai_tools()  # OpenAI function calling 格式
        ToolRegistry.execute("tool_name", {"param": "value"})  # 执行工具
    """

    _tools: Dict[str, Callable] = {}
    _descriptions: Dict[str, str] = {}

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
            cls._tools[name] = func
            # 从 docstring 第一行提取工具描述
            doc = func.__doc__ or ""
            cls._descriptions[name] = doc.strip().split("\n")[0].strip()
            return func
        return decorator

    @classmethod
    def get_openai_tools(cls, tool_names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        获取 OpenAI Function Calling 格式的工具列表

        Args:
            tool_names: 指定工具名称列表，None 则返回全部

        Returns:
            OpenAI tools 格式的列表
        """
        names = tool_names or list(cls._tools.keys())
        tools = []

        for name in names:
            func = cls._tools.get(name)
            if not func:
                continue

            tools.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": cls._descriptions.get(name, ""),
                    "parameters": _build_parameters_schema(func),
                }
            })

        return tools

    @classmethod
    def execute(cls, name: str, kwargs: Dict[str, Any]) -> str:
        """
        执行已注册的工具

        Args:
            name: 工具名称
            kwargs: 工具参数

        Returns:
            工具执行结果字符串
        """
        func = cls._tools.get(name)
        if not func:
            return f"错误：未找到工具 '{name}'"

        try:
            result = func(**kwargs)
            return str(result)
        except Exception as e:
            return f"工具 '{name}' 执行出错: {str(e)}"

    @classmethod
    def get_tool(cls, name: str) -> Optional[Callable]:
        """根据名称获取工具函数"""
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> List[str]:
        """获取所有已注册工具的名称列表"""
        return list(cls._tools.keys())

    @classmethod
    def clear(cls):
        """清空所有注册的工具（用于测试）"""
        cls._tools.clear()
        cls._descriptions.clear()
