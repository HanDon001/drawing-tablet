"""
绘图工具集（完整版）
AI 可调用的全部绘图操作，覆盖画布所有功能
"""

from typing import Optional
from app.core.tool_registry import ToolRegistry


# ─── 常量 ───────────────────────────────────────────────
VALID_SHAPES = ["circle", "rectangle", "triangle", "line", "star", "diamond", "arrow", "hexagon"]
VALID_COLORS = ["红", "蓝", "绿", "黄", "黑", "白", "橙", "紫", "粉", "灰"]
VALID_SIZES = ["small", "medium", "large"]
VALID_POSITIONS = [
    "center", "left_top", "top", "right_top",
    "left", "right",
    "left_bottom", "bottom", "right_bottom"
]
VALID_OPACITIES = [1.0, 0.7, 0.4]


# ─── 绘制 ───────────────────────────────────────────────
@ToolRegistry.register("draw_shape")
def draw_shape(
    shape_type: str,
    position: str = "center",
    color: str = "黑",
    size: str = "medium",
    opacity: float = 1.0,
    stroke_color: Optional[str] = None,
    stroke_width: Optional[int] = None,
    tag: Optional[str] = None
) -> str:
    """
    在画布上绘制一个形状

    Args:
        shape_type: 形状类型，枚举值 ["circle", "rectangle", "triangle", "line", "star", "diamond", "arrow", "hexagon"]
        position: 位置，枚举值 ["center", "left_top", "top", "right_top", "left", "right", "left_bottom", "bottom", "right_bottom"]
        color: 填充颜色，默认黑色。支持：红/蓝/绿/黄/黑/白/橙/紫/粉/灰
        size: 大小，枚举值 ["small", "medium", "large"]，默认 medium
        opacity: 透明度，1.0(不透明) / 0.7(半透明) / 0.4(较透明)，默认 1.0
        stroke_color: 边框颜色，同 color 可选值，None 表示无边框
        stroke_width: 边框粗细(像素)，默认 2
        tag: 给图形打标签，用于后续指代，如：太阳、房子

    Returns:
        操作结果描述
    """
    tag_info = f"，标签为'{tag}'" if tag else ""
    stroke_info = f"，边框{stroke_color}{stroke_width}px" if stroke_color else ""
    return f"已绘制{color}的{size}尺寸{shape_type}在{position}，透明度{opacity}{stroke_info}{tag_info}"


@ToolRegistry.register("draw_multiple")
def draw_multiple(
    shapes: str
) -> str:
    """
    一次性绘制多个图形（用于主题创作、场景构建）

    Args:
        shapes: JSON数组字符串，每个元素包含 shape_type/position/color/size/tag 等字段。
                示例: '[{"shape_type":"circle","color":"黄","size":"large","position":"center","tag":"太阳"},{"shape_type":"triangle","color":"橙","position":"left_top","tag":"光线1"}]'

    Returns:
        操作结果描述
    """
    import json
    try:
        items = json.loads(shapes)
        count = len(items)
        tags = [s.get("tag", "") for s in items if s.get("tag")]
        tag_info = f"（含标签：{'、'.join(tags)}）" if tags else ""
        return f"已批量绘制{count}个图形{tag_info}"
    except json.JSONDecodeError:
        return "错误：shapes 参数必须是有效的 JSON 数组字符串"


# ─── 编辑 ───────────────────────────────────────────────
@ToolRegistry.register("edit_shape")
def edit_shape(
    target_tag: str,
    new_color: Optional[str] = None,
    new_size: Optional[str] = None,
    new_position: Optional[str] = None,
    new_opacity: Optional[float] = None,
    new_stroke_color: Optional[str] = None,
    new_stroke_width: Optional[int] = None,
    new_tag: Optional[str] = None
) -> str:
    """
    修改画布上已有图形的属性

    Args:
        target_tag: 要修改的图形的名字或指代词，如：太阳、刚才的圆、它
        new_color: 新填充颜色
        new_size: 新大小 ["small", "medium", "large"]
        new_position: 新位置
        new_opacity: 新透明度 [1.0, 0.7, 0.4]
        new_stroke_color: 新边框颜色，设为"none"可移除边框
        new_stroke_width: 新边框粗细(像素)
        new_tag: 新标签名（重命名）

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
    if new_opacity is not None:
        changes.append(f"透明度改为{new_opacity}")
    if new_stroke_color:
        changes.append(f"边框颜色改为{new_stroke_color}")
    if new_stroke_width is not None:
        changes.append(f"边框粗细改为{new_stroke_width}px")
    if new_tag:
        changes.append(f"标签改为'{new_tag}'")

    if changes:
        return f"已将'{target_tag}'的{'，'.join(changes)}"
    return f"未对'{target_tag}'做任何修改"


@ToolRegistry.register("move_shape")
def move_shape(
    target_tag: str,
    position: str
) -> str:
    """
    移动图形到指定位置（比 edit_shape 更直观的位置操作）

    Args:
        target_tag: 要移动的图形的名字或指代词
        position: 目标位置，枚举值 ["center", "left_top", "top", "right_top", "left", "right", "left_bottom", "bottom", "right_bottom"]

    Returns:
        操作结果描述
    """
    return f"已将'{target_tag}'移动到{position}"


@ToolRegistry.register("resize_shape")
def resize_shape(
    target_tag: str,
    size: str
) -> str:
    """
    调整图形大小

    Args:
        target_tag: 要调整的图形的名字或指代词
        size: 新大小，枚举值 ["small", "medium", "large"]

    Returns:
        操作结果描述
    """
    return f"已将'{target_tag}'调整为{size}尺寸"


@ToolRegistry.register("set_opacity")
def set_opacity(
    target_tag: str,
    opacity: float
) -> str:
    """
    设置图形透明度

    Args:
        target_tag: 要设置的图形的名字或指代词
        opacity: 透明度值，1.0(完全不透明) / 0.7(半透明) / 0.4(较透明)

    Returns:
        操作结果描述
    """
    return f"已将'{target_tag}'的透明度设为{opacity}"


@ToolRegistry.register("set_stroke")
def set_stroke(
    target_tag: str,
    stroke_color: str,
    stroke_width: Optional[int] = None
) -> str:
    """
    设置图形边框样式

    Args:
        target_tag: 要设置的图形的名字或指代词
        stroke_color: 边框颜色，支持：红/蓝/绿/黄/黑/白/橙/紫/粉/灰，设为"none"移除边框
        stroke_width: 边框粗细(像素)，默认 2

    Returns:
        操作结果描述
    """
    width_info = f"，粗细{stroke_width}px" if stroke_width else ""
    return f"已将'{target_tag}'的边框设为{stroke_color}{width_info}"


# ─── 删除 ───────────────────────────────────────────────
@ToolRegistry.register("delete_shape")
def delete_shape(target_tag: str) -> str:
    """
    删除画布上的图形

    Args:
        target_tag: 要删除的图形的名字或指代词，如：太阳、刚才的圆、它

    Returns:
        操作结果描述
    """
    return f"已删除图形'{target_tag}'"


@ToolRegistry.register("delete_all")
def delete_all() -> str:
    """
    删除画布上的所有图形（清空画布）

    Returns:
        操作结果描述
    """
    return "已清空画布，所有图形已删除"


# ─── 查询 ───────────────────────────────────────────────
@ToolRegistry.register("list_shapes")
def list_shapes() -> str:
    """
    列出画布上所有图形的详细信息，包括位置、颜色、大小、标签等

    Returns:
        提示信息，要求前端返回画布对象列表
    """
    return "请返回画布上所有图形的完整列表，包含每个图形的形状、颜色、大小、位置、透明度、边框、标签信息。"


@ToolRegistry.register("get_shape_info")
def get_shape_info(target_tag: str) -> str:
    """
    获取指定图形的详细信息

    Args:
        target_tag: 图形的名字或指代词

    Returns:
        提示信息
    """
    return f"请返回图形'{target_tag}'的详细信息，包括形状、颜色、大小、位置、透明度、边框等。"


@ToolRegistry.register("describe_canvas")
def describe_canvas() -> str:
    """
    用自然语言描述当前画布内容，专为视障用户设计。
    描述应包含空间方位、颜色、大小等信息。

    Returns:
        提示信息
    """
    return "请根据画布上下文，用生动的自然语言描述画面内容，包含空间方位信息。适合语音播报。"


# ─── 操作 ───────────────────────────────────────────────
@ToolRegistry.register("undo")
def undo() -> str:
    """
    撤销上一步操作

    Returns:
        操作结果描述
    """
    return "已撤销上一步操作"


@ToolRegistry.register("redo")
def redo() -> str:
    """
    重做上一步被撤销的操作

    Returns:
        操作结果描述
    """
    return "已重做操作"


@ToolRegistry.register("select_shape")
def select_shape(target_tag: str) -> str:
    """
    选中画布上的某个图形（后续操作可省略 target_tag）

    Args:
        target_tag: 要选中的图形的名字或指代词

    Returns:
        操作结果描述
    """
    return f"已选中图形'{target_tag}'"


@ToolRegistry.register("duplicate_shape")
def duplicate_shape(
    target_tag: str,
    new_position: Optional[str] = None,
    new_tag: Optional[str] = None
) -> str:
    """
    复制一个图形

    Args:
        target_tag: 要复制的图形的名字或指代词
        new_position: 新图形的位置，None 则偏移一点
        new_tag: 新图形的标签名

    Returns:
        操作结果描述
    """
    pos_info = f"到{new_position}" if new_position else "在旁边"
    tag_info = f"，标签为'{new_tag}'" if new_tag else ""
    return f"已复制'{target_tag}'{pos_info}{tag_info}"


@ToolRegistry.register("reorder_shape")
def reorder_shape(
    target_tag: str,
    direction: str
) -> str:
    """
    调整图形的图层顺序（前后关系）

    Args:
        target_tag: 要调整的图形的名字或指代词
        direction: 方向，枚举值 ["front"(移到最前), "back"(移到最后), "forward"(前移一层), "backward"(后移一层)]

    Returns:
        操作结果描述
    """
    dir_map = {"front": "最前面", "back": "最后面", "forward": "前一层", "backward": "后一层"}
    return f"已将'{target_tag}'移到{dir_map.get(direction, direction)}"


# ─── 主题创作 ───────────────────────────────────────────
@ToolRegistry.register("create_theme")
def create_theme(theme_name: str) -> str:
    """
    根据主题一键创建预设场景（如星空、太阳、房子）

    Args:
        theme_name: 主题名称，支持 ["星空", "太阳", "房子"]

    Returns:
        操作结果描述
    """
    return f"正在创建'{theme_name}'主题场景"


@ToolRegistry.register("list_themes")
def list_themes() -> str:
    """
    列出所有可用的主题场景

    Returns:
        提示信息
    """
    return "可用主题：星空、太阳、房子。请选择一个主题。"


# ─── 画笔/填充/AI 绘图 ────────────────────────────────
@ToolRegistry.register("pen_draw")
def pen_draw(
    strokes: str,
    color: Optional[str] = None,
    size: Optional[int] = None
) -> str:
    """
    使用画笔在画布上自由绘制

    Args:
        strokes: 笔画数据的JSON字符串，格式为 '[{"points":[{"x":100,"y":200},{"x":105,"y":210}]}]'
        color: 画笔颜色，支持：红/蓝/绿/黄/黑/白/橙/紫/粉/灰
        size: 画笔粗细(像素)，1-50

    Returns:
        操作结果描述
    """
    import json
    try:
        stroke_data = json.loads(strokes)
        count = len(stroke_data) if isinstance(stroke_data, list) else 1
        color_info = f"，颜色{color}" if color else ""
        size_info = f"，粗细{size}px" if size else ""
        return f"已绘制{count}个笔画{color_info}{size_info}"
    except json.JSONDecodeError:
        return "错误：strokes 参数必须是有效的 JSON 字符串"


@ToolRegistry.register("fill_area")
def fill_area(
    color: str,
    x: Optional[int] = None,
    y: Optional[int] = None
) -> str:
    """
    在画布指定区域填充颜色

    Args:
        color: 填充颜色，支持：红/蓝/绿/黄/黑/白/橙/紫/粉/灰
        x: 填充起点的X坐标（像素），None则填充整个画布背景
        y: 填充起点的Y坐标（像素）

    Returns:
        操作结果描述
    """
    if x is not None and y is not None:
        return f"已在坐标({x},{y})处填充{color}"
    return f"已将画布背景填充为{color}"


@ToolRegistry.register("ai_generate_image")
def ai_generate_image(
    prompt: str,
    style: str = "realistic"
) -> str:
    """
    使用AI根据文字描述生成图片并添加到画布

    Args:
        prompt: 图像描述，如"一只可爱的橘猫坐在窗台上"
        style: 绘画风格，枚举值 ["realistic"(写实), "cartoon"(卡通), "anime"(动漫), "watercolor"(水彩), "oil"(油画), "sketch"(素描), "pixel"(像素), "chinese"(水墨)]

    Returns:
        操作结果描述
    """
    return f"正在根据'{prompt}'生成{style}风格的图片，请稍候..."


@ToolRegistry.register("ai_redraw_region")
def ai_redraw_region(
    prompt: str,
    region: str = "full"
) -> str:
    """
    使用AI重新绘制画布的某个区域

    Args:
        prompt: 重新绘制的描述
        region: 区域，"full"(全画布) 或坐标JSON '{"x":0,"y":0,"w":512,"h":512}'

    Returns:
        操作结果描述
    """
    return f"正在重新绘制区域({region})，描述：'{prompt}'"


@ToolRegistry.register("set_drawing_mode")
def set_drawing_mode(enabled: bool) -> str:
    """
    开启或关闭AI绘图模式

    Args:
        enabled: True开启AI绘图模式，False关闭

    Returns:
        操作结果描述
    """
    if enabled:
        return "已开启AI绘图模式，可以用语音描述生成图片"
    return "已关闭AI绘图模式，回到形状编辑模式"
