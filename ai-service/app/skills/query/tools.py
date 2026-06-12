"""
查询工具集
使用 @ToolRegistry.register 注册查询相关工具
"""

from app.core.tool_registry import ToolRegistry


@ToolRegistry.register("describe_canvas")
def describe_canvas() -> str:
    """
    描述当前画布上的内容，专为视障用户设计

    该工具会接收前端传入的 canvas_context，
    并由大模型生成包含空间方位的自然语言描述。

    Returns:
        提示信息
    """
    return "请根据画布上下文，用生动的自然语言描述画面内容，包含空间方位信息。"
