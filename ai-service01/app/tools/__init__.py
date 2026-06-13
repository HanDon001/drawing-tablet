"""
工具包 — 自动注册全部工具
"""

from .registry import ToolRegistry  # noqa: F401

from . import shape_tools    # 绘制: draw_shape, draw_multiple
from . import edit_tools     # 编辑: edit_shape, move, resize, delete, undo...
from . import query_tools    # 查询: list_shapes, describe_canvas
from . import other_tools    # 主题/AI: create_theme, ai_generate_image...
from . import control_tools  # 操控: set_active_tool, draw_freehand_path, trigger_ui_action...
from . import vector_tools   # 矢量: add_vector_shape, draw_svg_path
from . import vector_gen_tools  # 矢量生成: generate_vector_art (文生图+矢量化)
