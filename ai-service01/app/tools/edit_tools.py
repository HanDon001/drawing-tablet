"""
编辑工具 — 修改、移动、缩放、删除、撤销
"""

from .registry import ToolRegistry
from ..schemas.canvas import VALID_SIZES, VALID_POSITIONS, POSITION_NAMES

COLORS_ENUM = ["红", "蓝", "绿", "黄", "紫", "橙", "粉", "黑", "白", "灰", "无"]
DIRECTION_ENUM = ["front", "back", "forward", "backward"]


@ToolRegistry.register(
    name="edit_shape",
    description="修改已有图形的属性(颜色/大小/位置/透明度/边框)。用target_tag指定目标。",
    param_descriptions={
        "target_tag": "目标图形的名字，如'太阳'。也可用'它'指代当前选中的",
        "targetId": "目标图形ID(一般用target_tag即可)",
        "new_color": "新填充颜色",
        "new_size": "新大小",
        "new_position": "新位置",
        "new_opacity": "新透明度0-1",
        "new_stroke_color": "新边框颜色",
        "new_stroke_width": "新边框粗细",
        "new_tag": "改名",
    },
    param_enums={"new_size": VALID_SIZES, "new_position": VALID_POSITIONS, "new_color": COLORS_ENUM},
)
def edit_shape(target_tag: str = None, targetId: str = None, new_color: str = None,
               new_size: str = None, new_position: str = None, new_opacity: float = None,
               new_stroke_color: str = None, new_stroke_width: int = None,
               new_tag: str = None) -> str:
    return f"已修改 {target_tag or targetId}"


@ToolRegistry.register(
    name="move_shape",
    description="移动图形到新位置。",
    param_descriptions={
        "target_tag": "要移动的图形名字",
        "targetId": "图形ID",
        "position": "目标位置名称",
        "x": "目标x坐标(0-1)",
        "y": "目标y坐标(0-1)",
    },
    param_enums={"position": VALID_POSITIONS},
)
def move_shape(targetId: str = None, target_tag: str = None,
               position: str = "center", x: float = -1, y: float = -1) -> str:
    loc = f"({x},{y})" if x >= 0 and y >= 0 else POSITION_NAMES.get(position, position)
    return f"已移动到{loc}"


@ToolRegistry.register(
    name="resize_shape",
    description="调整图形大小。",
    param_descriptions={"target_tag": "图形名字", "targetId": "图形ID", "size": "新大小"},
    param_enums={"size": VALID_SIZES},
)
def resize_shape(targetId: str = None, target_tag: str = None, size: str = "medium") -> str:
    return f"已调整为{size}"


@ToolRegistry.register(
    name="set_opacity",
    description="设置图形透明度。",
    param_descriptions={"target_tag": "图形名字", "opacity": "透明度0-1"},
)
def set_opacity(targetId: str = None, target_tag: str = None, opacity: float = 1.0) -> str:
    return f"透明度→{opacity}"


@ToolRegistry.register(
    name="set_stroke",
    description="设置图形边框。",
    param_descriptions={"target_tag": "图形名字", "stroke_color": "边框颜色", "stroke_width": "粗细px"},
    param_enums={"stroke_color": COLORS_ENUM},
)
def set_stroke(targetId: str = None, target_tag: str = None,
               stroke_color: str = "无", stroke_width: int = 2) -> str:
    return f"边框→{stroke_color}"


@ToolRegistry.register(
    name="delete_shape",
    description="删除指定图形。",
    param_descriptions={"target_tag": "要删除的图形名字"},
)
def delete_shape(targetId: str = None, target_tag: str = None) -> str:
    return f"已删除 {target_tag or targetId}"


@ToolRegistry.register(name="delete_all", description="清空画布，删除所有图形。")
def delete_all() -> str:
    return "已清空画布"


@ToolRegistry.register(
    name="rotate_shape",
    description="旋转图形到指定角度。",
    param_descriptions={
        "target_tag": "图形名字",
        "angle": "旋转角度(度)，正数=顺时针，负数=逆时针，如90=顺时针90度",
    },
)
def rotate_shape(target_tag: str = None, targetId: str = None, angle: float = 0) -> str:
    return f"已旋转{angle}度"


@ToolRegistry.register(name="undo", description="撤销上一步操作。")
def undo() -> str:
    return "已撤销"


@ToolRegistry.register(name="redo", description="重做上一步撤销的操作。")
def redo() -> str:
    return "已重做"


@ToolRegistry.register(
    name="select_shape",
    description="选中一个图形。",
    param_descriptions={"target_tag": "图形名字"},
)
def select_shape(targetId: str = None, target_tag: str = None) -> str:
    return f"已选中 {target_tag or targetId}"


@ToolRegistry.register(
    name="duplicate_shape",
    description="复制一个图形。",
    param_descriptions={"target_tag": "要复制的图形名字", "new_tag": "副本名字"},
)
def duplicate_shape(targetId: str = None, target_tag: str = None, new_tag: str = None) -> str:
    return f"已复制 {target_tag or targetId}"


@ToolRegistry.register(
    name="reorder_shape",
    description="调整图形图层顺序。",
    param_descriptions={
        "target_tag": "图形名字",
        "direction": "front=最前,back=最后,forward=前移一层,backward=后移一层",
    },
    param_enums={"direction": DIRECTION_ENUM},
)
def reorder_shape(targetId: str = None, target_tag: str = None,
                  direction: str = "forward") -> str:
    return f"图层→{direction}"


@ToolRegistry.register(
    name="fill_area",
    description="给图形填充颜色。",
    param_descriptions={"target_tag": "图形名字", "color": "填充颜色"},
    param_enums={"color": COLORS_ENUM},
)
def fill_area(target_tag: str = None, x: float = 0, y: float = 0, color: str = "红") -> str:
    return f"已填充{color}"
