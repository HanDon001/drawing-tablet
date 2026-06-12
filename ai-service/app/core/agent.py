"""
Agent 核心调度模块
简化版本，直接路由到对应的 Skill
"""

from typing import Dict, List, Any, Optional
from loguru import logger

from .config import settings
from .skill_base import BaseSkill
from app.skills.draw.skill import DrawSkill
from app.skills.query.skill import QuerySkill


class Agent:
    """
    Agent 核心调度器

    职责：
    1. 根据用户文本路由到合适的 Skill
    2. 解析结果返回 reply 和 actions
    """

    def __init__(self):
        """初始化 Agent"""
        # 初始化 Skills
        self.draw_skill = DrawSkill()
        self.query_skill = QuerySkill()

        logger.info("Agent 初始化完成")

    def _route_skill(self, text: str) -> BaseSkill:
        """
        根据用户文本路由到合适的 Skill

        Args:
            text: 用户输入文本

        Returns:
            匹配的 Skill 实例
        """
        # 查询关键词
        query_keywords = ["有什么", "画布上", "什么样子", "描述", "看看", "内容"]

        # 检查是否为查询指令
        for keyword in query_keywords:
            if keyword in text:
                logger.info(f"路由到 QuerySkill，匹配关键词: {keyword}")
                return self.query_skill

        # 默认使用绘图技能
        logger.info("路由到 DrawSkill")
        return self.draw_skill

    def _parse_intent(self, text: str) -> Dict[str, Any]:
        """
        简单的意图解析（不依赖LLM）

        Args:
            text: 用户输入文本

        Returns:
            解析结果
        """
        result = {
            "tool": None,
            "params": {},
            "reply": ""
        }

        # 删除操作
        if "删除" in text or "去掉" in text:
            result["tool"] = "delete_shape"
            result["reply"] = f"已删除图形"
            return result

        # 编辑操作
        if "改成" in text or "修改" in text or "变成" in text:
            result["tool"] = "edit_shape"
            # 简单提取颜色
            colors = ["红", "蓝", "绿", "黄", "黑", "白", "橙"]
            for color in colors:
                if color in text:
                    result["params"]["new_color"] = color
                    result["reply"] = f"已将颜色改为{color}"
                    break
            return result

        # 绘制操作
        draw_keywords = ["画", "绘制", "画一个", "画个"]
        for keyword in draw_keywords:
            if keyword in text:
                result["tool"] = "draw_shape"

                # 提取形状
                if "圆" in text:
                    result["params"]["shape_type"] = "circle"
                elif "方" in text or "矩" in text:
                    result["params"]["shape_type"] = "rectangle"
                elif "三角" in text:
                    result["params"]["shape_type"] = "triangle"
                else:
                    result["params"]["shape_type"] = "circle"

                # 提取颜色
                colors = {"红": "红", "蓝": "蓝", "绿": "绿", "黄": "黄", "黑": "黑", "白": "白", "橙": "橙"}
                for key, value in colors.items():
                    if key in text:
                        result["params"]["color"] = value
                        break

                # 提取位置
                positions = {
                    "中间": "center",
                    "左上": "left_top",
                    "右上": "right_top",
                    "左下": "left_bottom",
                    "右下": "right_bottom"
                }
                for key, value in positions.items():
                    if key in text:
                        result["params"]["position"] = value
                        break

                # 提取标签
                if "叫做" in text or "叫" in text:
                    # 简单提取标签
                    import re
                    match = re.search(r'叫[做]?["\s]*(\w+)', text)
                    if match:
                        result["params"]["tag"] = match.group(1)

                result["reply"] = f"已绘制图形"
                break

        return result

    async def chat(
        self,
        text: str,
        canvas_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        处理用户对话

        Args:
            text: 用户输入文本
            canvas_context: 画布上下文描述

        Returns:
            {
                "reply": "AI的语音回复",
                "actions": [
                    {"tool": "draw_shape", "params": {...}},
                    ...
                ]
            }
        """
        logger.info(f"Agent.chat 收到: text='{text}', canvas_context='{canvas_context}'")

        try:
            # 简单的意图解析
            intent = self._parse_intent(text)

            actions = []
            if intent["tool"]:
                actions.append({
                    "tool": intent["tool"],
                    "params": intent["params"]
                })

            reply = intent["reply"] or f"收到指令：{text}"

            logger.info(f"Agent.chat 返回: reply='{reply}', actions={actions}")

            return {
                "reply": reply,
                "actions": actions
            }

        except Exception as e:
            logger.error(f"Agent.chat 错误: {str(e)}")
            return {
                "reply": "抱歉，处理指令时出错了，请稍后重试",
                "actions": []
            }


# 全局 Agent 实例
agent_instance = Agent()
