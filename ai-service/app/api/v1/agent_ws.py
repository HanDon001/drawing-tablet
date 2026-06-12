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

    协议:
    - 客户端 → 服务端:
        {"type": "text", "text": "画一个红色的圆"}     # 用户输入
        {"type": "canvas", "objects": [...]}            # 画布状态同步
        {"type": "stop"}                                # 停止 Agent

    - 服务端 → 客户端:
        {"type": "speak", "text": "好的，已画好"}       # 播报
        {"type": "action", "action": {tool, params}}    # 执行动作
        {"type": "state", "state": "idle|processing|speaking"}  # 状态变更
    """
    await ws.accept()
    logger.info("Agent WebSocket 已连接")

    agent = AgentLoop()

    try:
        # 启动 Agent 主循环
        agent_task = asyncio.create_task(agent.run(ws))

        # 监听前端消息
        while True:
            try:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "text":
                    # 用户输入 → 注入到 Agent
                    # Agent 的 wait_for_input 会读取 WebSocket
                    # 这里不需要额外处理，消息已经被 wait_for_input 读取
                    pass

                elif msg_type == "canvas":
                    # 画布状态同步
                    objects = msg.get("objects", [])
                    agent.update_canvas(objects)
                    logger.debug(f"画布同步: {len(objects)} 个对象")

                elif msg_type == "mouse_target":
                    # 鼠标选中目标（用于指代词解析）
                    target = msg.get("target")
                    agent.canvas.last_mouse_target = target
                    logger.debug(f"鼠标目标: {target}")

                elif msg_type == "stop":
                    # 停止 Agent
                    agent.stop()
                    break

            except json.JSONDecodeError:
                logger.warning("收到非 JSON 消息")

    except WebSocketDisconnect:
        logger.info("Agent WebSocket 客户端断开")
    except Exception as e:
        logger.error(f"Agent WebSocket 错误: {e}")
    finally:
        agent.stop()
        if not agent_task.done():
            agent_task.cancel()
            try:
                await agent_task
            except asyncio.CancelledError:
                pass
        logger.info("Agent WebSocket 已关闭")
