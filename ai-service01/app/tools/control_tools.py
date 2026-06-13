"""
操控工具 — 让 AI 像人一样操控画布
切换工具、设置画笔、自由绘画、触发UI按钮、删除对象
"""

from .registry import ToolRegistry


@ToolRegistry.register(
    name="set_active_tool",
    description="切换当前激活的绘图工具。切换后用户可以手动使用该工具。",
    param_descriptions={
        "tool": "工具名称: select(选择) pen(画笔) eraser(橡皮擦) fill(填充)",
    },
    param_enums={
        "tool": ["select", "pen", "eraser", "fill"],
    },
)
def set_active_tool(tool: str = "pen") -> str:
    return f"已切换到{tool}工具"


@ToolRegistry.register(
    name="set_brush_params",
    description="设置画笔/橡皮擦的参数（颜色、大小）。",
    param_descriptions={
        "color": "画笔颜色，十六进制如#FF0000，或中文如红/蓝/绿",
        "size": "笔刷粗细，1-50像素",
    },
)
def set_brush_params(color: str = None, size: int = None) -> str:
    parts = []
    if color: parts.append(f"颜色→{color}")
    if size: parts.append(f"大小→{size}")
    return f"画笔设置: {', '.join(parts)}" if parts else "无变更"


@ToolRegistry.register(
    name="draw_freehand_path",
    description="用画笔在画布上自由绘画。传入坐标点数组，系统会连线绘制。适合画曲线、签名、简单图案。",
    param_descriptions={
        "points": "坐标点JSON数组，格式[{\"x\":0.1,\"y\":0.2},{\"x\":0.15,\"y\":0.25}]，坐标为0-1比例",
        "color": "画笔颜色，十六进制或中文",
        "size": "笔刷粗细1-50",
    },
)
def draw_freehand_path(points: str = "[]", color: str = None, size: int = None) -> str:
    return f"已绘制自由路径"


@ToolRegistry.register(
    name="trigger_ui_action",
    description="触发页面UI按钮动作。可以撤销、清空、切换面板等。",
    param_descriptions={
        "action": "动作标识: undo(撤销) clear_all(清空) redo(重做)",
    },
    param_enums={
        "action": ["undo", "clear_all", "redo"],
    },
)
def trigger_ui_action(action: str = "undo") -> str:
    return f"已触发: {action}"


@ToolRegistry.register(
    name="delete_object",
    description="通过ID精确删除画布上的某个对象。",
    param_descriptions={
        "object_id": "对象ID，从画布状态中获取，如 obj_001",
    },
)
def delete_object(object_id: str = "") -> str:
    return f"已删除对象 {object_id}"


@ToolRegistry.register(
    name="draw_preset_pattern",
    description="在指定位置绘制预设图案（花、树、房子、星星等）。系统自动生成坐标点并绘制。",
    param_descriptions={
        "pattern": "图案名称: flower(花) tree(树) house(房子) heart(心) star(星星)",
        "x": "中心x坐标(0-1比例)",
        "y": "中心y坐标(0-1比例)",
        "scale": "缩放倍数，默认1",
        "color": "主色调，中文或十六进制",
    },
    param_enums={
        "pattern": ["flower", "tree", "house", "heart", "star"],
    },
)
def draw_preset_pattern(pattern: str = "flower", x: float = 0.5, y: float = 0.5,
                        scale: float = 1.0, color: str = "红") -> str:
    return f"已绘制{pattern}在({x},{y})"
