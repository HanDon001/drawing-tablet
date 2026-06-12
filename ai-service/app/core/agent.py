"""
Agent 核心调度模块
接入通义千问 qwen3.6-plus 的 Function Calling 能力
"""

import json
import re
from typing import Dict, List, Any, Optional, AsyncGenerator
from openai import AsyncOpenAI, RateLimitError, APIError
from tenacity import retry, stop_after_attempt, wait_exponential
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
    4. 多模型降级 + 离线兜底
    """

    # 降级模型列表
    FALLBACK_MODELS = [
        "qwen3.6-plus",   # 主力
        "qwen-plus",      # 降级 1
        "qwen-turbo",     # 降级 2 (更快但能力弱)
    ]

    def __init__(self):
        """初始化 Agent"""
        self.draw_skill = DrawSkill()
        self.query_skill = QuerySkill()

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

            # 4. 调用 LLM（带重试 + 多模型降级）
            logger.info(f"调用 LLM，工具列表: {skill_tool_names}")
            try:
                response = await self._call_llm_with_fallback(messages, openai_tools)
            except Exception as e:
                logger.error(f"所有 LLM 模型均失败: {e}，使用离线兜底")
                return self._local_fallback(text)

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

    async def _call_llm_with_fallback(self, messages, tools):
        """调用 LLM，多模型降级"""
        for model in self.FALLBACK_MODELS:
            try:
                return await self._call_llm(model, messages, tools)
            except (RateLimitError, APIError) as e:
                logger.warning(f"模型 {model} 失败: {e}，降级到下一个")
                continue
        raise Exception("所有模型均失败")

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def _call_llm(self, model, messages, tools):
        """单次 LLM 调用（带重试）"""
        return await self.client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools if tools else None,
            tool_choice="auto" if tools else None,
        )

    def _local_fallback(self, text: str) -> Dict[str, Any]:
        """离线兜底：正则匹配基础指令"""
        patterns = [
            (r"画.*(圆|圈)", "draw_shape", {"shape_type": "circle", "position": "center", "color": "黑", "size": "medium"}),
            (r"画.*(方|正方|矩形)", "draw_shape", {"shape_type": "rectangle", "position": "center", "color": "黑", "size": "medium"}),
            (r"画.*(三角)", "draw_shape", {"shape_type": "triangle", "position": "center", "color": "黑", "size": "medium"}),
            (r"画.*(线|直线)", "draw_shape", {"shape_type": "line", "position": "center", "color": "黑", "size": "medium"}),
            (r"删除|去掉", "delete_shape", {"target_tag": "最近的"}),
            (r"撤销|撤回", "undo", {}),
            (r"清空|清除", "clear", {}),
        ]
        for pattern, tool, params in patterns:
            if re.search(pattern, text):
                if tool in ("undo", "clear"):
                    return {"reply": "好的（离线模式）", "actions": []}
                return {"reply": "好的（离线模式）", "actions": [{"tool": tool, "params": params}]}

        return {"reply": "网络不稳定，请稍后重试", "actions": []}

    async def chat_stream(
        self,
        text: str,
        canvas_context: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        流式处理用户对话，SSE 逐步返回

        Yields:
            {"type": "actions", "actions": [...]}
            {"type": "tts_text", "text": "..."}
            {"type": "done"}
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

            # 第一次 LLM 调用（处理 tool_calls）
            try:
                response = await self._call_llm_with_fallback(messages, openai_tools)
            except Exception as e:
                logger.error(f"流式 LLM 失败: {e}，使用离线兜底")
                fallback = self._local_fallback(text)
                yield {"type": "actions", "actions": fallback["actions"]}
                yield {"type": "tts_text", "text": fallback["reply"]}
                yield {"type": "done"}
                return

            message = response.choices[0].message
            actions = []

            if message.tool_calls:
                messages.append(message.model_dump())

                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}

                    result = ToolRegistry.execute(tool_name, tool_args)
                    actions.append({"tool": tool_name, "params": tool_args})

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })

                yield {"type": "actions", "actions": actions}

                stream = await self.client.chat.completions.create(
                    model=self.model, messages=messages, stream=True,
                )
            else:
                yield {"type": "actions", "actions": []}
                stream = await self.client.chat.completions.create(
                    model=self.model, messages=messages, stream=True,
                )

            # 流式消费，按句切分
            buffer = ""
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if not delta:
                    continue
                buffer += delta

                sentences = _split_sentences(buffer)
                if len(sentences) > 1:
                    complete = sentences[:-1]
                    buffer = sentences[-1]
                    for s in complete:
                        s = s.strip()
                        if s:
                            yield {"type": "tts_text", "text": s}

            if buffer.strip():
                yield {"type": "tts_text", "text": buffer.strip()}

            yield {"type": "done"}

        except Exception as e:
            logger.error(f"Agent.chat_stream 错误: {str(e)}")
            yield {"type": "tts_text", "text": "抱歉，处理指令时出错了"}
            yield {"type": "done"}


def _split_sentences(text: str) -> List[str]:
    """按中文标点切分句子，保留标点"""
    parts = re.split(r'([。！？；\n])', text)
    sentences = []
    for i in range(0, len(parts) - 1, 2):
        sentences.append(parts[i] + parts[i + 1])
    if len(parts) % 2 == 1 and parts[-1]:
        sentences.append(parts[-1])
    return sentences


# 全局 Agent 实例
agent_instance = Agent()
