"""
绘图技能模块
封装绘图相关的 Prompt 和 Tools，覆盖画布全部功能
"""

from app.core.skill_base import BaseSkill
from app.skills.draw.tools import (
    # 绘制
    draw_shape, draw_multiple,
    # 编辑
    edit_shape, move_shape, resize_shape, set_opacity, set_stroke,
    # 删除
    delete_shape, delete_all,
    # 查询
    list_shapes, get_shape_info, describe_canvas,
    # 操作
    undo, redo, select_shape, duplicate_shape, reorder_shape,
    # 主题
    create_theme, list_themes,
    # 画笔/填充/AI 绘图
    pen_draw, fill_area, ai_generate_image, ai_redraw_region, set_drawing_mode,
)


class DrawSkill(BaseSkill):
    """绘图技能 - 完整版（含画笔/AI绘图）"""

    def get_prompt(self) -> str:
        return """你是语音画板助手"小画"，拥有画布的完全控制权。

【形状】circle(圆) / rectangle(方块) / triangle(三角) / line(直线) / star(星) / diamond(菱) / arrow(箭头) / hexagon(六边形)
【颜色】红/蓝/绿/黄/黑/白/橙/紫/粉/灰
【大小】small(小) / medium(中) / large(大)
【位置】center(中) / left_top(左上) / top(上) / right_top(右上) / left(左) / right(右) / left_bottom(左下) / bottom(下) / right_bottom(右下)
【透明度】1.0(不透明) / 0.7(半透明) / 0.4(较透明)
【边框】可设置边框颜色和粗细
【画笔】自由手绘，可设置颜色和粗细
【填充】在指定区域填充颜色
【AI绘图】根据文字描述生成图片，支持多种风格

【工具使用规则】
1. 绘制新图形用 draw_shape
2. 一次画多个图形用 draw_multiple（JSON数组）
3. 修改属性用 edit_shape（支持颜色/大小/位置/透明度/边框/标签）
4. 移动位置用 move_shape，调整大小用 resize_shape
5. 设置透明度用 set_opacity，设置边框用 set_stroke
6. 删除单个用 delete_shape，清空画布用 delete_all
7. 撤销用 undo，重做用 redo
8. 复制图形用 duplicate_shape
9. 调整图层顺序用 reorder_shape
10. 查询画布内容用 describe_canvas 或 list_shapes
11. 主题创作用 create_theme，查看主题用 list_themes
12. 用户命名用tag。"它/刚才那个"推断target_tag。
13. 默认: color=黑, size=medium, position=center, opacity=1.0
14. 画笔自由绘制用 pen_draw
15. 填充颜色用 fill_area
16. AI生成图片用 ai_generate_image（支持风格：realistic/cartoon/anime/watercolor/oil/sketch/pixel/chinese）
17. AI重新绘制区域用 ai_redraw_region
18. 开关AI绘图模式用 set_drawing_mode
19. 回复<20字，口语化，无Markdown。"""

    def get_tools(self) -> list:
        return [
            # 绘制
            draw_shape, draw_multiple,
            # 编辑
            edit_shape, move_shape, resize_shape, set_opacity, set_stroke,
            # 删除
            delete_shape, delete_all,
            # 查询
            list_shapes, get_shape_info, describe_canvas,
            # 操作
            undo, redo, select_shape, duplicate_shape, reorder_shape,
            # 主题
            create_theme, list_themes,
            # 画笔/填充/AI 绘图
            pen_draw, fill_area, ai_generate_image, ai_redraw_region, set_drawing_mode,
        ]
