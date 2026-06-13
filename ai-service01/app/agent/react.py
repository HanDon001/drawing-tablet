"""
Reactor — 循环协调器
编排: Route → Think → Act → Observe → Reflect

数据流:
  Route:  轻量判断需要哪类工具 (关键词/小模型)
  Think:  只看相关工具，LLM 决定具体调用
  Act:    执行工具
  Observe: 结果追加到对话历史
  Reflect: LLM 看到结果，决定继续或结束
"""

import asyncio
from typing import Dict, Any
from loguru import logger
from .planner import planner
from .executor import executor

MAX_ROUNDS = 5


class ReActAgent:

    async def run(self, text: str, canvas_context: str = "") -> Dict[str, Any]:
        # 1. ROUTE: 先判断需要哪类工具
        tool_groups = await planner.route(text)
        logger.info(f"[ReAct] 路由结果: {tool_groups}")

        # 2. 构建消息
        messages = planner.build_messages(text, canvas_context)
        all_actions = []
        reply = None

        for round_num in range(1, MAX_ROUNDS + 1):
            logger.info(f"[ReAct] ── 第 {round_num} 轮 ──")

            # 3. THINK: 只发相关工具给 LLM
            try:
                msg, tool_calls, elapsed = await planner.think(messages, tool_groups)
            except asyncio.TimeoutError:
                logger.warning(f"[ReAct] 第{round_num}轮超时")
                break
            except Exception as e:
                logger.error(f"[ReAct] 第{round_num}轮失败: {e}")
                break

            # 4. 无工具调用 → 任务完成
            if not tool_calls:
                reply = planner.extract_reply(msg)
                logger.info(f"[ReAct] 完成 ({elapsed:.1f}s)")
                break

            # 5. ACT + OBSERVE
            messages.append(msg.model_dump())
            round_actions, tool_messages = executor.run_batch(tool_calls, canvas_context)
            messages.extend(tool_messages)
            all_actions.extend(round_actions)

            logger.info(f"[ReAct] 第{round_num}轮: {len(round_actions)}个工具, "
                        f"累计{len(all_actions)}个动作")

            # 6. REFLECT: 已追加到 messages，下一轮自动看到

        if not reply:
            reply = "已完成操作"

        logger.info(f"[ReAct] 结束: '{reply}' 共{len(all_actions)}个动作")
        return {"reply": reply, "actions": all_actions}


agent = ReActAgent()
