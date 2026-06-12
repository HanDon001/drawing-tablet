"""
查询技能模块
封装画布查询相关的 Prompt 和 Tools
"""

from app.core.skill_base import BaseSkill
from app.skills.query.tools import describe_canvas


class QuerySkill(BaseSkill):
    """查询技能"""

    def get_prompt(self) -> str:
        """
        返回查询技能的 System Prompt

        Returns:
            Prompt 字符串
        """
        return """画布查询模式。用自然语言描述画面内容给视障用户。

要求：含空间方位（左上/右下/中间等）、颜色、大小、形状。无 Markdown。画布为空说"画布上还没有任何图形"。回复 <50 字。"""

    def get_tools(self) -> list:
        """
        返回查询技能需要的工具列表

        Returns:
            工具列表
        """
        return [describe_canvas]
