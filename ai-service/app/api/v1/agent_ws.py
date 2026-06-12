"""
Agent 永久循环 WebSocket 端点

前端连接后，Agent 持续运行：
- 等待用户输入
- 处理指令
- 温柔播报
- 空闲关怀
"""

import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.agent_loop import AgentLoop

router = APIRouter(prefix="/ai/v1", tags=["agent-ws"])


@router.websocket("/agent")
async def agent_websocket(ws: WebSocket):
    """
    Agent 永久循环 WebSocket

    单一消息路由：所有前端消息统一进入队列，Agent 从队列消费
    """
    await ws.accept()
    logger.info("Agent WebSocket 已连接")

    agent = AgentLoop()
    agent._ws = ws
    agent._running = True

    # 消息队列：前端消息统一入队
    message_queue = asyncio.Queue()

    async def read_frontend():
        """读取前端所有消息，入队"""
        try:
            while agent._running:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                await message_queue.put(msg)
        except (WebSocketDisconnect, asyncio.CancelledError):
            await message_queue.put({"type": "_disconnect"})
        except Exception as e:
            logger.error(f"前端消息读取错误: {e}")
            await message_queue.put({"type": "_disconnect"})

    async def agent_loop():
        """Agent 主循环：从队列消费消息"""
        import time

        # 开场白
        greeting = agent._pick("greeting")
        if agent.canvas.is_empty():
            greeting += "画布是空的，告诉我你想画什么吧。"
        else:
            greeting += agent.canvas.describe_for_user()
        await agent.send_speak(greeting)

        while agent._running:
            try:
                # 等待消息（带超时，用于主动关怀）
                try:
                    msg = await asyncio.wait_for(message_queue.get(), timeout=agent.idle_timeout)
                except asyncio.TimeoutError:
                    # 超时：主动关怀
                    await agent.proactive_care()
                    continue

                msg_type = msg.get("type")

                if msg_type == "_disconnect":
                    break

                elif msg_type == "text":
                    # 用户文字输入
                    text = msg.get("text", "")
                    if text:
                        await agent.process_input(text)
                        agent.last_activity = time.time()

                elif msg_type == "audio":
                    # 语音数据（二进制，VAD 检测到的语音片段）
                    # 暂存，等 silence_end 时一起发给 ASR
                    pass

                elif msg_type == "silence_end":
                    # 用户说完一句话 → 发送给 Agent 处理
                    # 此时可以从缓存的音频中提取文本
                    # 简化处理：前端已经通过 ASR 得到文本，这里触发处理
                    pass

                elif msg_type == "canvas":
                    # 画布状态同步
                    objects = msg.get("objects", [])
                    agent.update_canvas(objects)

                elif msg_type == "mouse_target":
                    # 鼠标选中目标
                    target = msg.get("target")
                    agent.canvas.last_mouse_target = target

                elif msg_type == "stop":
                    agent.stop()
                    break

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Agent 循环错误: {e}")
                await agent.send_speak(agent._pick("error", reason="出了点小问题"))

    try:
        # 并行运行：前端消息读取 + Agent 主循环
        read_task = asyncio.create_task(read_frontend())
        agent_task = asyncio.create_task(agent_loop())

        done, pending = await asyncio.wait(
            [read_task, agent_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except Exception as e:
        logger.error(f"Agent WebSocket 错误: {e}")
    finally:
        agent.stop()
        logger.info("Agent WebSocket 已关闭")
