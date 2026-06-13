"""
其他工具 — 主题、AI绘图、画笔
"""

from .registry import ToolRegistry

THEMES_ENUM = ["星空", "太阳", "房子"]


@ToolRegistry.register(
    name="create_theme",
    description="创建预设主题画作。会清空画布后绘制主题全部图形。注意：只在用户明确要求时使用，一般优先用draw_shape自由创作。",
    param_descriptions={"theme_name": "主题名称"},
    param_enums={"theme_name": THEMES_ENUM},
)
def create_theme(theme_name: str = "星空") -> str:
    return f"已创建主题: {theme_name}"


@ToolRegistry.register(name="list_themes", description="列出可用主题。")
def list_themes() -> str:
    return "可用主题：星空、太阳、房子"


@ToolRegistry.register(
    name="ai_generate_image",
    description="用AI生成一张图片放到画布上。适合复杂图案如风景、动物。",
    param_descriptions={"prompt": "图片描述", "style": "风格"},
)
def ai_generate_image(prompt: str = "", style: str = "realistic") -> str:
    return f"已提交AI生成: {prompt}"


@ToolRegistry.register(
    name="ai_redraw_region",
    description="用AI重新绘制画布指定区域。",
    param_descriptions={"prompt": "重绘描述"},
)
def ai_redraw_region(prompt: str = "", x: float = 0, y: float = 0,
                     width: float = 100, height: float = 100) -> str:
    return f"已AI重绘: {prompt}"


@ToolRegistry.register(
    name="set_drawing_mode",
    description="开启或关闭AI绘画模式。",
    param_descriptions={"enabled": "true=开启, false=关闭"},
)
def set_drawing_mode(enabled: bool = True) -> str:
    return f"绘画模式: {'开启' if enabled else '关闭'}"


@ToolRegistry.register(
    name="pen_draw",
    description="用画笔绘制自由笔画。",
    param_descriptions={"strokes": "笔画JSON数组", "color": "颜色", "size": "粗细px"},
)
def pen_draw(strokes: str = "[]", color: str = "黑", size: int = 3) -> str:
    return "已用画笔绘制"
