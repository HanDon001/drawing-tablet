"""
画布共享常量 — 前后端唯一定义
"""

VALID_SHAPES = ["circle", "rectangle", "triangle", "line", "star", "diamond", "arrow", "hexagon"]
VALID_COLORS = ["红", "蓝", "绿", "黄", "紫", "橙", "粉", "黑", "白", "棕", "灰"]
VALID_SIZES = ["small", "medium", "large"]
VALID_POSITIONS = [
    "center", "left_top", "top", "right_top",
    "left", "right",
    "left_bottom", "bottom", "right_bottom",
]
VALID_OPACITIES = [0.25, 0.5, 0.75, 1.0]

# 形状中文名映射
SHAPE_NAMES = {
    "circle": "圆形", "rectangle": "矩形", "triangle": "三角形",
    "line": "直线", "star": "星形", "diamond": "菱形",
    "arrow": "箭头", "hexagon": "六边形",
}

# 位置中文名映射
POSITION_NAMES = {
    "center": "中间", "left_top": "左上角", "top": "上方", "right_top": "右上角",
    "left": "左边", "right": "右边",
    "left_bottom": "左下角", "bottom": "下方", "right_bottom": "右下角",
}

# 中文→形状
SHAPE_MAP = {
    "圆": "circle", "方": "rectangle", "矩": "rectangle",
    "三角": "triangle", "直线": "line", "星": "star",
    "菱": "diamond", "箭头": "arrow", "六边": "hexagon",
}

# 颜色映射
COLOR_MAP = {
    "红": "#EF4444", "蓝": "#3B82F6", "绿": "#10B981", "黄": "#F59E0B",
    "紫": "#8B5CF6", "橙": "#F97316", "粉": "#EC4899", "黑": "#1F2937",
    "白": "#F9FAFB", "棕": "#92400E", "灰": "#6B7280", "金": "#F59E0B", "青": "#06B6D4",
}
