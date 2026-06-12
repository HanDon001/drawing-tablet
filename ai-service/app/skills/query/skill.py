"""
查询技能模块
封装画布查询相关的 Prompt 和 Tools
"""

from app.core.skill_base import BaseSkill
from app.skills.draw.tools import describe_canvas, list_shapes, get_shape_info


class QuerySkill(BaseSkill):
    """查询技能"""

    def get_prompt(self) -> str:
        return """你现在是画布查询模式。视障用户想了解画面内容。

【查询规则】
1. 你的回复将被 TTS 播报，严禁使用 Markdown 格式。
2. 用生动、包含空间方位的自然语言描述画面。
3. 空间方位参考：左上角、右上角、左下角、右下角、中间、上方、下方、左边、右边。
4. 描述时包含颜色、大小、形状等属性。
5. 如果画布为空，请告知用户"画布上还没有任何图形"。
6. 用户问某个图形详情时，用 get_shape_info 查询。

【示例回复】
- "画布中间有一个红色的大圆，左上角有一个蓝色的小方块。"
- "画布底部有一条绿色的横线，上方偏右有一个黄色的三角形。"""

    def get_tools(self) -> list:
        return [describe_canvas, list_shapes, get_shape_info]
