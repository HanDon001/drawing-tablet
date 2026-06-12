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
        return """绘图模式。调用工具执行。

默认: color=黑, size=medium, position=center
形状: circle/rectangle/triangle/line
颜色: 红/蓝/绿/黄/黑/白/橙
位置: center/左上/右上/左下/右下
用户命名用tag。"它/刚才那个"推断target_tag。
回复<20字，口语化。"""

    def get_tools(self) -> list:
        """
        返回绘图技能需要的工具列表

        Returns:
            工具列表
        """
        return [draw_shape, edit_shape, delete_shape]
