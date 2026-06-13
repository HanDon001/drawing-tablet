"""
矢量工具 — 高质量参数化矢量图形 + SVG路径
"""

from .registry import ToolRegistry

VECTOR_SHAPES = ["heart", "spiral", "wave", "gear", "tree", "cloud", "lightning", "flower", "arrow_curve"]


@ToolRegistry.register(
    name="add_vector_shape",
    description="绘制高质量矢量图形。支持心形、螺旋、波浪、齿轮、树、云、闪电等复杂图案。比draw_shape更精细。",
    param_descriptions={
        "shape_type": "矢量图形类型",
        "x": "中心x坐标(0-1)",
        "y": "中心y坐标(0-1)",
        "scale": "缩放倍数,1.0为默认",
        "rotation": "旋转角度(度)",
        "stroke_color": "描边颜色，中文或十六进制",
        "fill_color": "填充颜色",
        "stroke_width": "描边宽度px",
    },
    param_enums={"shape_type": VECTOR_SHAPES},
)
def add_vector_shape(shape_type: str = "heart", x: float = 0.5, y: float = 0.5,
                     scale: float = 1.0, rotation: float = 0,
                     stroke_color: str = "无", fill_color: str = "红",
                     stroke_width: int = 2) -> str:
    return f"已绘制矢量{shape_type}在({x},{y})"


@ToolRegistry.register(
    name="draw_svg_path",
    description="直接用SVG路径语法绘制矢量图形。适合LLM生成简单SVG路径。语法:M=移动,L=直线,C=三次贝塞尔,Q=二次贝塞尔,Z=闭合。",
    param_descriptions={
        "svg_d": "SVG path的d属性,如'M 0 0 L 50 0 L 25 -40 Z'",
        "x": "路径偏移x(0-1)",
        "y": "路径偏移y(0-1)",
        "fill": "填充颜色",
        "stroke": "描边颜色",
        "stroke_width": "描边宽度",
        "scale": "缩放倍数",
    },
)
def draw_svg_path(svg_d: str = "", x: float = 0.5, y: float = 0.5,
                  fill: str = "无", stroke: str = "黑",
                  stroke_width: int = 2, scale: float = 1.0) -> str:
    return f"已绘制SVG路径在({x},{y})"
