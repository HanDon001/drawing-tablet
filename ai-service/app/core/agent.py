"""
Agent 核心调度模块
接入通义千问 qwen3.6-plus 的 Function Calling 能力
"""

import json
from typing import Dict, List, Any, Optional
from openai import AsyncOpenAI
from loguru import logger

from .config import settings
from .tool_registry import ToolRegistry
from .skill_base import BaseSkill
from app.skills.draw.skill import DrawSkill
from app.skills.query.skill import QuerySkill

# 确保所有工具在 import 时通过 @ToolRegistry.register 注册
import app.skills.draw.tools  # noqa: F401


# 全局系统提示词
SYSTEM_PROMPT = """语音助手"小画"。回复口语化、<20字、无Markdown。"""


class Agent:
    """
    Agent 核心调度器

    职责：
    1. 根据用户文本路由到合适的 Skill
    2. 调用 LLM 进行意图理解和工具调用
    3. 执行工具并返回结构化结果
    """

    def __init__(self):
        """初始化 Agent"""
        # 初始化 Skills
        self.draw_skill = DrawSkill()
        self.query_skill = QuerySkill()

        # 初始化 LLM 客户端 (DashScope OpenAI 兼容 API)
        self.client = AsyncOpenAI(
            api_key=settings.DASHSCOPE_API_KEY,
            base_url=settings.DASHSCOPE_BASE_URL,
        )
        self.model = settings.LLM_MODEL

        # 注册所有工具到 LLM（不再按 Skill 分组，全部可用）
        self.all_tools = ToolRegistry.get_openai_tools()
        logger.info(f"Agent 初始化完成，模型: {self.model}，已注册 {len(self.all_tools)} 个工具")
        logger.info(f"工具列表: {ToolRegistry.list_tools()}")

    def _route_skill(self, text: str) -> BaseSkill:
        """
        根据用户文本路由到合适的 Skill

        Args:
            text: 用户输入文本

        Returns:
            匹配的 Skill 实例
        """
        query_keywords = ["有什么", "画布上", "什么样子", "描述", "看看", "内容", "上面有", "几个", "多少"]

        for keyword in query_keywords:
            if keyword in text:
                logger.info(f"路由到 QuerySkill，匹配关键词: {keyword}")
                return self.query_skill

        logger.info("路由到 DrawSkill")
        return self.draw_skill

    def _build_system_prompt(self, skill: BaseSkill, canvas_context: Optional[str] = None) -> str:
        """
        构建完整的 System Prompt

        Args:
            skill: 当前路由到的技能
            canvas_context: 画布上下文描述

        Returns:
            完整的系统提示词
        """
        parts = [SYSTEM_PROMPT, skill.get_prompt()]

        if canvas_context:
            parts.append(f"\n【当前画布状态】\n{canvas_context}")

        return "\n\n".join(parts)

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
            # 1. 路由到合适的 Skill（用于 prompt 选择）
            skill = self._route_skill(text)

            # 2. 构建消息
            system_content = self._build_system_prompt(skill, canvas_context)

            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": text},
            ]

            # 3. 所有工具全部提供给 LLM（不按 skill 限制）
            openai_tools = self.all_tools

            # 4. 调用 LLM（8秒超时）
            import asyncio as _asyncio
            logger.info(f"调用 LLM({self.model})，可用工具数: {len(openai_tools)}")

            try:
                response = await _asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        tools=openai_tools if openai_tools else None,
                        tool_choice="auto" if openai_tools else None,
                    ),
                    timeout=8.0,
                )
            except _asyncio.TimeoutError:
                logger.warning(f"LLM({self.model}) 超时，降级到本地解析")
                return self._local_fallback(text)

            message = response.choices[0].message
            actions = []

            # 5. 处理工具调用（支持多工具连续调用）
            if message.tool_calls:
                messages.append(message.model_dump())

                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}

                    logger.info(f"LLM 调用工具: {tool_name}({tool_args})")

                    # 执行工具
                    result = ToolRegistry.execute(tool_name, tool_args)
                    logger.info(f"工具结果: {result}")

                    # 记录 action
                    actions.append({
                        "tool": tool_name,
                        "params": tool_args,
                    })

                    # 将工具结果追加到消息
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })

                # 6. 再次调用 LLM，获取自然语言回复
                second_response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                )
                reply = second_response.choices[0].message.content or "已完成操作"

            else:
                # LLM 直接返回文本（查询模式或闲聊）
                reply = message.content or "收到指令"

            # 清理回复：去掉可能的 Markdown 格式
            reply = reply.strip()
            if reply.startswith("```"):
                lines = reply.split("\n")
                reply = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
                reply = reply.strip()

            logger.info(f"Agent.chat 返回: reply='{reply}', actions={actions}")

            return {
                "reply": reply,
                "actions": actions,
            }

        except Exception as e:
            logger.error(f"Agent.chat 错误: {str(e)}")
            return {
                "reply": "抱歉，处理指令时出错了，请稍后重试",
                "actions": [],
            }

    def _local_fallback(self, text: str) -> Dict[str, Any]:
        """
        LLM 超时时的本地降级解析

        Args:
            text: 用户输入文本

        Returns:
            解析结果
        """
        from app.skills.draw.tools import VALID_SHAPES, VALID_COLORS, VALID_POSITIONS, VALID_SIZES

        # 简单关键词匹配
        detected_shape = None
        for shape in VALID_SHAPES:
            if shape in text:
                detected_shape = shape
                break

        # 中文形状名映射
        shape_map = {
            "圆": "circle", "方块": "rectangle", "矩形": "rectangle",
            "三角": "triangle", "直线": "line", "星": "star",
            "菱": "diamond", "箭头": "arrow", "六边": "hexagon"
        }
        if not detected_shape:
            for cn, en in shape_map.items():
                if cn in text:
                    detected_shape = en
                    break

        if detected_shape:
            return {
                "reply": f"好的，画一个{detected_shape}",
                "actions": [{"tool": "draw_shape", "params": {"shape_type": detected_shape}}],
            }

        return {
            "reply": "抱歉，我没太听清，你能再说一次吗？",
            "actions": [],
        }


# 全局 Agent 实例
agent_instance = Agent()
