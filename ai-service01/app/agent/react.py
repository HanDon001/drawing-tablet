"""
ReActor — 循环协调器
"""

import asyncio
from typing import Dict, Any
from loguru import logger
from .planner import planner
from .executor import executor

MAX_ROUNDS = 5


class ReActAgent:

    async def run(self, text: str, canvas_context: str = "") -> Dict[str, Any]:
        tool_groups = await planner.route(text)
        logger.info(f"[ReAct] 路由结果: {tool_groups}")

        messages = planner.build_messages(text, canvas_context)
        all_actions = []
        reply = None
        self._consecutive_errors = 0

        for round_num in range(1, MAX_ROUNDS + 1):
            logger.info(f"[ReAct] ── 第 {round_num} 轮 ──")

            try:
                msg, tool_calls, elapsed = await planner.think(messages, tool_groups)
            except asyncio.TimeoutError:
                logger.warning(f"[ReAct] 第{round_num}轮超时")
                break
            except Exception as e:
                logger.error(f"[ReAct] 第{round_num}轮失败: {e}")
                break

            if not tool_calls:
                reply = planner.extract_reply(msg)
                logger.info(f"[ReAct] 完成 ({elapsed:.1f}s)")
                break

            messages.append(msg.model_dump())

            # 【关键修改】传递 messages 给 Executor，用于质量守门
            round_actions, tool_messages = await executor.run_batch(
                tool_calls, canvas_context, messages=messages
            )
            messages.extend(tool_messages)
            all_actions.extend(round_actions)

            logger.info(f"[ReAct] 第{round_num}轮: {len(round_actions)}个工具, "
                        f"累计{len(all_actions)}个动作")

            # 连续错误检测
            error_count = sum(
                1 for m in tool_messages
                if isinstance(m.get("content", ""), str)
                and ("错误" in m["content"] or "拦截" in m["content"])
            )
            if error_count > 0:
                self._consecutive_errors += 1
                if self._consecutive_errors >= 3:
                    reply = "抱歉，操作多次失败，请换个方式描述。"
                    logger.warning(f"[ReAct] 连续{self._consecutive_errors}次错误，中断")
                    break
            else:
                self._consecutive_errors = 0

        if not reply:
            reply = "已完成操作"

        logger.info(f"[ReAct] 结束: '{reply}' 共{len(all_actions)}个动作")
        return {"reply": reply, "actions": all_actions}


agent = ReActAgent()
