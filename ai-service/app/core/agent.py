"""
Agent 核心调度模块
接入通义千问 qwen3.6-plus 的 Function Calling 能力
"""

import json
import re
from typing import Dict, List, Any, Optional, AsyncGenerator
from openai import AsyncOpenAI
from loguru import logger

from .config import settings
from .tool_registry import ToolRegistry
from .skill_base import BaseSkill
from app.skills.draw.skill import DrawSkill
from app.skills.query.skill import QuerySkill


# 全局系统提示词
SYSTEM_PROMPT = """你是 VoiceCanvas 的智能语音助手"小画"，专为残障人士服务。

【全局规则】
1. 你的回复将被 TTS 播报，严禁使用 Markdown 格式，保持简短口语化。
2. 每次执行动作后，必须用自然语言确认结果。
3. 当用户说"它"、"刚才那个"时，需结合上下文解析。
4. 若遇到危险或不当请求，温和拒绝。"""


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

        logger.info(f"Agent 初始化完成，模型: {self.model}")

    def _route_skill(self, text: str) -> BaseSkill:
        """
        根据用户文本路由到合适的 Skill

        Args:
            text: 用户输入文本

        Returns:
            匹配的 Skill 实例
        """
        query_keywords = ["有什么", "画布上", "什么样子", "描述", "看看", "内容", "上面有"]

        for keyword in query_keywords:
            if keyword in text:
                logger.info(f"路由到 QuerySkill，匹配关键词: {keyword}")
                return self.query_skill

        logger.info("路由到 DrawSkill")
        return self.draw_skill

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
            # 1. 路由到合适的 Skill
            skill = self._route_skill(text)

            # 2. 构建消息
            system_content = SYSTEM_PROMPT + "\n\n" + skill.get_prompt()
            if canvas_context:
                system_content += f"\n\n【当前画布状态】\n{canvas_context}"

            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": text},
            ]

            # 3. 获取当前 Skill 的工具列表（OpenAI 格式）
            skill_tool_names = [t.__name__ for t in skill.get_tools()]
            openai_tools = ToolRegistry.get_openai_tools(skill_tool_names)

            # 4. 调用 LLM
            logger.info(f"调用 LLM，工具列表: {skill_tool_names}")
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=openai_tools if openai_tools else None,
                tool_choice="auto" if openai_tools else None,
            )

            message = response.choices[0].message
            actions = []

            # 5. 处理工具调用
            if message.tool_calls:
                # 将助手消息（含 tool_calls）加入对话
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

    async def chat_stream(
        self,
        text: str,
        canvas_context: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        流式处理用户对话，SSE 逐步返回

        Yields:
            {"type": "actions", "actions": [...]}  — 工具调用结果
            {"type": "tts_text", "text": "..."}    — 按句切分的文本，前端可即时 TTS
            {"type": "done"}                       — 流结束
        """
        logger.info(f"Agent.chat_stream 收到: text='{text}'")

        try:
            skill = self._route_skill(text)

            system_content = SYSTEM_PROMPT + "\n\n" + skill.get_prompt()
            if canvas_context:
                system_content += f"\n\n【当前画布状态】\n{canvas_context}"

            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": text},
            ]

            skill_tool_names = [t.__name__ for t in skill.get_tools()]
            openai_tools = ToolRegistry.get_openai_tools(skill_tool_names)

            # 第一次 LLM 调用（非流式，处理 tool_calls）
            logger.info(f"调用 LLM，工具列表: {skill_tool_names}")
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=openai_tools if openai_tools else None,
                tool_choice="auto" if openai_tools else None,
            )

            message = response.choices[0].message
            actions = []

            # 处理工具调用
            if message.tool_calls:
                messages.append(message.model_dump())

                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}

                    logger.info(f"LLM 调用工具: {tool_name}({tool_args})")
                    result = ToolRegistry.execute(tool_name, tool_args)

                    actions.append({"tool": tool_name, "params": tool_args})

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })

                # 先返回 actions
                yield {"type": "actions", "actions": actions}

                # 第二次 LLM 调用（流式）
                stream = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    stream=True,
                )
            else:
                # 无工具调用，直接流式返回
                yield {"type": "actions", "actions": []}

                stream = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    stream=True,
                )

            # 流式消费，按句切分
            buffer = ""
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if not delta:
                    continue
                buffer += delta

                # 按句切分
                sentences = _split_sentences(buffer)
                if len(sentences) > 1:
                    complete = sentences[:-1]
                    buffer = sentences[-1]
                    for s in complete:
                        s = s.strip()
                        if s:
                            yield {"type": "tts_text", "text": s}

            # 剩余文本
            if buffer.strip():
                yield {"type": "tts_text", "text": buffer.strip()}

            yield {"type": "done"}

        except Exception as e:
            logger.error(f"Agent.chat_stream 错误: {str(e)}")
            yield {"type": "tts_text", "text": "抱歉，处理指令时出错了"}
            yield {"type": "done"}


def _split_sentences(text: str) -> List[str]:
    """按中文标点和英文标点切分句子，保留标点"""
    parts = re.split(r'([。！？；\n])', text)
    sentences = []
    for i in range(0, len(parts) - 1, 2):
        sentences.append(parts[i] + parts[i + 1])
    if len(parts) % 2 == 1 and parts[-1]:
        sentences.append(parts[-1])
    return sentences


# 全局 Agent 实例
agent_instance = Agent()
