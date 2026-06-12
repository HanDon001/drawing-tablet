"""
Agent 核心调度模块
整合通义千问与 Skill，实现意图识别和工具调用
"""

from typing import Dict, List, Any, Optional
from loguru import logger

from langchain_community.chat_models.tongyi import ChatTongyi
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from .config import settings
from .skill_base import BaseSkill
from skills.draw.skill import DrawSkill
from skills.query.skill import QuerySkill


class Agent:
    """
    Agent 核心调度器

    职责：
    1. 根据用户文本路由到合适的 Skill
    2. 组装 Prompt 和 Tools
    3. 调用大模型执行
    4. 解析结果返回 reply 和 actions
    """

    def __init__(self):
        """初始化 Agent"""
        # 初始化通义千问模型
        self.llm = ChatTongyi(
            model=settings.LLM_MODEL,
            dashscope_api_key=settings.DASHSCOPE_API_KEY,
            streaming=False
        )

        # 初始化 Skills
        self.draw_skill = DrawSkill()
        self.query_skill = QuerySkill()

        logger.info(f"Agent 初始化完成，模型: {settings.LLM_MODEL}")

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

    def _create_executor(self, skill: BaseSkill) -> AgentExecutor:
        """
        为指定 Skill 创建 AgentExecutor

        Args:
            skill: 技能实例

        Returns:
            AgentExecutor 实例
        """
        # 获取 Skill 的 Prompt 和 Tools
        skill_prompt = skill.get_prompt()
        tools = skill.get_tools()

        # 系统提示词
        system_prompt = f"""你是 VoiceCanvas 的智能语音助手"小画"，专为残障人士服务。

【全局规则】
1. 你的回复将被 TTS 播报，严禁使用 Markdown 格式，保持简短口语化。
2. 每次执行动作后，必须用自然语言确认结果。
3. 当用户说"它"、"刚才那个"时，需结合上下文解析。
4. 若遇到危险或不当请求，温和拒绝。

{skill_prompt}
"""

        # 创建 Prompt Template
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])

        # 创建 Agent
        agent = create_tool_calling_agent(self.llm, tools, prompt)

        # 创建 AgentExecutor
        executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=3
        )

        return executor

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

            # 2. 创建 Executor
            executor = self._create_executor(skill)

            # 3. 组装输入
            input_text = text
            if canvas_context:
                input_text = f"【画布状态】{canvas_context}\n\n【用户指令】{text}"

            # 4. 执行
            result = await executor.ainvoke({"input": input_text})

            # 5. 解析结果
            output = result.get("output", "")
            actions = self._parse_actions(result)

            logger.info(f"Agent.chat 返回: reply='{output}', actions={actions}")

            return {
                "reply": output,
                "actions": actions
            }

        except Exception as e:
            logger.error(f"Agent.chat 错误: {str(e)}")
            return {
                "reply": "抱歉，处理指令时出错了，请稍后重试",
                "actions": []
            }

    def _parse_actions(self, result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        从 Agent 结果中解析工具调用动作

        Args:
            result: Agent 执行结果

        Returns:
            动作列表
        """
        actions = []

        # 从 intermediate_steps 中提取工具调用
        intermediate_steps = result.get("intermediate_steps", [])

        for step in intermediate_steps:
            if len(step) >= 2:
                agent_action, tool_output = step
                if hasattr(agent_action, "tool") and hasattr(agent_action, "tool_input"):
                    actions.append({
                        "tool": agent_action.tool,
                        "params": agent_action.tool_input
                    })

        return actions


# 全局 Agent 实例
agent_instance = Agent()
