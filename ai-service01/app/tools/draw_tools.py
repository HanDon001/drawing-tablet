"""
绘图工具 — 引用 schemas/canvas.py 常量
"""

from .registry import ToolRegistry
from ..schemas.canvas import (
    VALID_SHAPES, VALID_COLORS, VALID_SIZES, VALID_POSITIONS,
    SHAPE_NAMES, POSITION_NAMES,
)


@ToolRegistry.register(description="绘制一个图形。位置可用 position 名称(left_top/center/right_bottom等)或 x,y 坐标(0-1比例，x:0=左1=右, y:0=上1=下)。")
def draw_shape(shape_type: str = "circle", color: str = "黑", size: str = "medium",
               position: str = "center", x: float = -1, y: float = -1,
               opacity: float = 1.0,
               stroke_color: str = "none", stroke_width: int = 2, tag: str = None) -> str:
    if x >= 0 and y >= 0:
        return f"已绘制{color}的{size}尺寸{shape_type}在({x},{y})"
    return f"已绘制{color}的{size}尺寸{shape_type}在{position}"


@ToolRegistry.register(description="批量绘制多个图形")
def draw_multiple(shapes: str = "[]") -> str:
    return f"已批量绘制图形"


@ToolRegistry.register(description="编辑已有图形的属性（颜色、大小、位置等）。用 target_tag 指定目标，如 target_tag='圆形'。颜色用中文如'红''蓝''绿'。")
def edit_shape(target_tag: str = None, targetId: str = None, newColor: str = None,
               newSize: str = None, newPosition: str = None, newOpacity: float = None,
               newStrokeColor: str = None, newStrokeWidth: int = None, new_tag: str = None) -> str:
    desc = []
    if newColor: desc.append(f"颜色→{newColor}")
    if newSize: desc.append(f"大小→{newSize}")
    if newPosition: desc.append(f"位置→{newPosition}")
    if newOpacity is not None: desc.append(f"透明度→{newOpacity}")
    if newStrokeColor: desc.append(f"边框→{newStrokeColor}")
    return f"已修改{target_tag or targetId or '图形'}: {', '.join(desc) if desc else '无变更'}"


@ToolRegistry.register(description="移动图形到新位置。可用 position 名称或 x,y 坐标(0-1比例)。")
def move_shape(targetId: str = None, target_tag: str = None, position: str = "center",
               x: float = -1, y: float = -1) -> str:
    if x >= 0 and y >= 0:
        return f"已移动到({x},{y})"
    return f"已移动到{POSITION_NAMES.get(position, position)}"


@ToolRegistry.register(description="调整图形大小")
def resize_shape(targetId: str = None, target_tag: str = None, size: str = "medium") -> str:
    return f"已调整为{size}"


@ToolRegistry.register(description="设置图形透明度")
def set_opacity(targetId: str = None, target_tag: str = None, opacity: float = 1.0) -> str:
    return f"透明度设为{opacity}"


@ToolRegistry.register(description="设置图形边框")
def set_stroke(targetId: str = None, target_tag: str = None,
               stroke_color: str = "none", stroke_width: int = 2) -> str:
    return f"边框已设置"


@ToolRegistry.register(description="删除图形")
def delete_shape(targetId: str = None, target_tag: str = None) -> str:
    return "已删除"


@ToolRegistry.register(description="清空画布")
def delete_all() -> str:
    return "已清空"


@ToolRegistry.register(description="列出所有图形")
def list_shapes() -> str:
    return "画布为空"


@ToolRegistry.register(description="获取图形详细信息")
def get_shape_info(targetId: str = None, target_tag: str = None) -> str:
    return "未找到"


@ToolRegistry.register(description="描述画布内容")
def describe_canvas() -> str:
    return "画布为空"


@ToolRegistry.register(description="撤销上一步操作")
def undo() -> str:
    return "已撤销"


@ToolRegistry.register(description="重做上一步撤销的操作")
def redo() -> str:
    return "重做功能开发中"


@ToolRegistry.register(description="选中图形")
def select_shape(targetId: str = None, target_tag: str = None) -> str:
    return "已选中"


@ToolRegistry.register(description="复制图形")
def duplicate_shape(targetId: str = None, target_tag: str = None, new_tag: str = None) -> str:
    return "已复制"


@ToolRegistry.register(description="调整图层顺序")
def reorder_shape(targetId: str = None, target_tag: str = None, direction: str = "forward") -> str:
    return f"已调整图层: {direction}"


@ToolRegistry.register(description="创建主题画作")
def create_theme(theme_name: str = "星空") -> str:
    return f"已创建主题: {theme_name}"


@ToolRegistry.register(description="列出可用主题")
def list_themes() -> str:
    return "可用主题：星空、太阳、房子"


@ToolRegistry.register(description="AI 生成图片")
def ai_generate_image(prompt: str = "", style: str = "realistic") -> str:
    return f"已提交AI图片生成: {prompt}"


@ToolRegistry.register(description="设置绘画模式")
def set_drawing_mode(enabled: bool = True) -> str:
    return f"绘画模式: {'开启' if enabled else '关闭'}"


@ToolRegistry.register(description="用画笔绘制自由笔画")
def pen_draw(strokes: str = "[]", color: str = "黑", size: int = 3) -> str:
    return f"已用画笔绘制"


@ToolRegistry.register(description="填充区域颜色")
def fill_area(x: float = 0, y: float = 0, color: str = "红") -> str:
    return f"已填充{color}色"


@ToolRegistry.register(description="AI 重新绘制指定区域")
def ai_redraw_region(prompt: str = "", x: float = 0, y: float = 0, width: float = 100, height: float = 100) -> str:
    return f"已AI重绘区域: {prompt}"
