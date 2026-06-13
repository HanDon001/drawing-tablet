"""
绘制工具 — 画形状、批量绘制
"""

from .registry import ToolRegistry
from ..schemas.canvas import VALID_SHAPES, VALID_SIZES, VALID_POSITIONS, COLOR_MAP

SHAPES_ENUM = VALID_SHAPES
SIZES_ENUM = VALID_SIZES
POSITIONS_ENUM = VALID_POSITIONS
COLORS_ENUM = ["红", "蓝", "绿", "黄", "紫", "橙", "粉", "黑", "白", "灰", "无"]


@ToolRegistry.register(
    name="draw_shape",
    description="绘制一个图形到画布上。8种形状可选，用x,y坐标或position名称定位。必须指定color否则不可见。",
    param_descriptions={
        "shape_type": "图形类型",
        "color": "填充颜色，中文。必须指定！'无'=透明不填充",
        "size": "大小",
        "position": "位置名称(不指定x,y时使用)",
        "x": "水平坐标0-1，0=最左,0.5=中间,1=最右",
        "y": "垂直坐标0-1，0=最上,0.5=中间,1=最下",
        "opacity": "透明度0-1",
        "stroke_color": "边框颜色，中文。'无'=无边框",
        "stroke_width": "边框粗细px",
        "tag": "给图形命名，方便后续引用",
    },
    param_enums={
        "shape_type": SHAPES_ENUM,
        "size": SIZES_ENUM,
        "position": POSITIONS_ENUM,
        "color": COLORS_ENUM,
        "stroke_color": COLORS_ENUM,
    },
)
def draw_shape(shape_type: str = "circle", color: str = "黑", size: str = "medium",
               position: str = "center", x: float = -1, y: float = -1,
               opacity: float = 1.0, stroke_color: str = "无",
               stroke_width: int = 2, tag: str = None) -> str:
    loc = f"({x},{y})" if x >= 0 and y >= 0 else position
    c = COLOR_MAP.get(color, color)
    return f"已绘制{c}色{shape_type}在{loc}"


@ToolRegistry.register(
    name="draw_multiple",
    description="一次性绘制多个图形。用于组合复杂图案(如太阳=圆+光线，房子=墙+屋顶+窗+门)。",
    param_descriptions={
        "shapes": "JSON数组字符串，每个元素含shape_type/color/size/position/x/y/tag",
    },
)
def draw_multiple(shapes: str = "[]") -> str:
    return "已批量绘制"
