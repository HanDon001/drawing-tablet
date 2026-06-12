"""
绘图工具集
使用 @ToolRegistry.register 注册绘图相关工具
"""

from typing import Optional
from core.tool_registry import ToolRegistry


@ToolRegistry.register("draw_shape")
def draw_shape(
    shape_type: str,
    position: str,
    color: str = "black",
    size: str = "medium",
    tag: Optional[str] = None
) -> str:
    """
    在画布上绘制一个形状

    Args:
        shape_type: 形状类型，枚举值 ["circle", "rectangle", "triangle", "line"]
        position: 位置，枚举值 ["center", "left_top", "left_bottom", "right_top", "right_bottom",
                  "中间", "左上角", "右上角", "左下角", "右下角"]
        color: 颜色名称，默认黑色。支持：红/蓝/绿/黄/黑/白/橙
        size: 大小，枚举值 ["small", "medium", "large"]，默认 medium
        tag: 给图形打标签，用于后续指代，如：太阳、房子

    Returns:
        操作结果描述
    """
    tag_info = f"，标签为'{tag}'" if tag else ""
    return f"已绘制{color}{size}的{shape_type}在{position}{tag_info}"


@ToolRegistry.register("edit_shape")
def edit_shape(
    target_tag: str,
    new_color: Optional[str] = None,
    new_size: Optional[str] = None,
    new_position: Optional[str] = None
) -> str:
    """
    修改画布上已有图形的属性

    Args:
        target_tag: 要修改的图形的名字或指代词，如：太阳、刚才的圆
        new_color: 新颜色
        new_size: 新大小 ["small", "medium", "large"]
        new_position: 新位置

    Returns:
        操作结果描述
    """
    changes = []
    if new_color:
        changes.append(f"颜色改为{new_color}")
    if new_size:
        changes.append(f"大小改为{new_size}")
    if new_position:
        changes.append(f"位置移到{new_position}")

    if changes:
        return f"已将'{target_tag}'的{'，'.join(changes)}"
    return f"未对'{target_tag}'做任何修改"


@ToolRegistry.register("delete_shape")
def delete_shape(target_tag: str) -> str:
    """
    删除画布上的图形

    Args:
        target_tag: 要删除的图形的名字或指代词

    Returns:
        操作结果描述
    """
    return f"已删除图形'{target_tag}'"
