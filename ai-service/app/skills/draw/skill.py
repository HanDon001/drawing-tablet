"""
绘图技能模块
封装绘图相关的 Prompt 和 Tools
"""

from app.core.skill_base import BaseSkill
from app.skills.draw.tools import draw_shape, edit_shape, delete_shape


class DrawSkill(BaseSkill):
    """绘图技能"""

    def get_prompt(self) -> str:
        """
        返回绘图技能的 System Prompt

        Returns:
            Prompt 字符串
        """
        return """你现在是绘图模式。请根据用户指令调用相应的绘图工具。

【绘图规则】
1. 如果用户没有指定颜色，默认使用黑色。
2. 如果用户没有指定大小，默认使用 medium。
3. 如果用户没有指定位置，默认使用 center（中间）。
4. 支持的形状：circle（圆）、rectangle（矩形）、triangle（三角形）、line（线）。
5. 支持的颜色：红、蓝、绿、黄、黑、白、橙。
6. 支持的位置：center/中间、left_top/左上角、right_top/右上角、left_bottom/左下角、right_bottom/右下角。
7. 如果用户给图形起了名字（如"太阳"），请使用 tag 参数记录。
8. 当用户说"它"、"刚才那个"时，根据上下文推断 target_tag。

【示例】
- "画个圆" → draw_shape(shape_type="circle", position="center", color="black", size="medium")
- "在左上角画一个红色的大圆" → draw_shape(shape_type="circle", position="left_top", color="红", size="large")
- "把太阳改成蓝色" → edit_shape(target_tag="太阳", new_color="蓝")
"""

    def get_tools(self) -> list:
        """
        返回绘图技能需要的工具列表

        Returns:
            工具列表
        """
        return [draw_shape, edit_shape, delete_shape]
