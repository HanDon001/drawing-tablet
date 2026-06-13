"""
查询工具 — 查看画布状态和图形信息
"""

from .registry import ToolRegistry


@ToolRegistry.register(
    name="list_shapes",
    description="列出画布上所有图形。用户问'有什么'、'看看画布'时调用。",
)
def list_shapes() -> str:
    return "画布为空"


@ToolRegistry.register(
    name="get_shape_info",
    description="获取指定图形的详细信息。",
    param_descriptions={"target_tag": "图形名字"},
)
def get_shape_info(targetId: str = None, target_tag: str = None) -> str:
    return "未找到"


@ToolRegistry.register(
    name="describe_canvas",
    description="用自然语言描述画布内容，适合语音播报。",
)
def describe_canvas() -> str:
    return "画布为空"
