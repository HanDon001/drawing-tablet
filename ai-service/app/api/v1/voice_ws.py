"""
语音服务 WebSocket 路由
代理浏览器 ↔ DashScope ASR Realtime WebSocket
"""

import json
import asyncio
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.config import settings

router = APIRouter(prefix="/ai/v1/voice", tags=["voice-ws"])

DASHSCOPE_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"


@router.websocket("/asr/ws")
async def asr_websocket(client_ws: WebSocket):
    """
    WebSocket 代理：浏览器 ↔ DashScope ASR Realtime

    协议：
    - 客户端发送 {"action": "start", "config": {...}} 开始识别
    - 客户端发送二进制 PCM 音频数据 (16kHz, 16bit, mono)
    - 客户端发送 {"action": "stop"} 结束识别
    - 服务端推送 {"type": "result", "text": "...", "is_final": bool}
    - 服务端推送 {"type": "status", "status": "started"|"stopped"|"error"}
    """
    await client_ws.accept()
    logger.info("ASR WebSocket 客户端已连接")

    dashscope_ws = None

    try:
        # 连接 DashScope WebSocket
        headers = {
            "Authorization": f"bearer {settings.DASHSCOPE_API_KEY}",
            "X-DashScope-DataInspection": "enable",
        }

        dashscope_ws = await websockets.connect(
            DASHSCOPE_WS_URL,
            extra_headers=headers,
            max_size=10 * 1024 * 1024,
        )
        logger.info("已连接 DashScope ASR WebSocket")

        # 并行处理两个方向的消息
        async def client_to_dashscope():
            """客户端 → DashScope: 载荷/音频转发"""
            task_started = False

            while True:
                try:
                    data = await client_ws.receive()
                except Exception:
                    break

                if data.get("type") == "websocket.disconnect":
                    break

                # 文本消息：控制指令
                if "text" in data:
                    msg = json.loads(data["text"])
                    action = msg.get("action")

                    if action == "start":
                        # 发送 run-task 到 DashScope
                        run_task = {
                            "header": {
                                "action": "run-task",
                                "task_id": msg.get("task_id", "asr-001"),
                                "streaming": "duplex",
                            },
                            "payload": {
                                "task_group": "audio",
                                "task": "asr",
                                "function": "recognition",
                                "model": "paraformer-realtime-v2",
                                "parameters": {
                                    "format": "pcm",
                                    "sample_rate": 16000,
                                    "vad_segmentation": True,
                                    **msg.get("config", {}).get("parameters", {}),
                                },
                                "input": {},
                            },
                        }
                        await dashscope_ws.send(json.dumps(run_task))
                        logger.info(f"已发送 run-task: {json.dumps(run_task, ensure_ascii=False)[:200]}")

                    elif action == "stop":
                        # 发送 finish-task
                        finish_task = {
                            "header": {
                                "action": "finish-task",
                                "task_id": "asr-001",
                                "streaming": "duplex",
                            },
                            "payload": {"input": {}},
                        }
                        await dashscope_ws.send(json.dumps(finish_task))
                        logger.info("已发送 finish-task")

                # 二进制消息：PCM 音频数据
                elif "bytes" in data:
                    audio_bytes = data["bytes"]
                    if audio_bytes and dashscope_ws.open:
                        await dashscope_ws.send(audio_bytes)

        async def dashscope_to_client():
            """DashScope → 客户端: 结果转发"""
            while True:
                try:
                    raw = await dashscope_ws.recv()
                except Exception:
                    break

                if isinstance(raw, bytes):
                    # 二进制数据，忽略
                    continue

                # JSON 消息
                msg = json.loads(raw)
                action = msg.get("header", {}).get("action", "")

                if action == "task-started":
                    await client_ws.send_json({"type": "status", "status": "started"})
                    logger.info("DashScope ASR task started")

                elif action == "result-generated":
                    # 识别结果
                    text = msg.get("payload", {}).get("output", {}).get("text", "")
                    sentence = msg.get("payload", {}).get("output", {}).get("sentence", "")
                    is_final = msg.get("header", {}).get("event", "") == "task-finished"

                    result_text = sentence or text
                    if result_text:
                        await client_ws.send_json({
                            "type": "result",
                            "text": result_text,
                            "is_final": is_final,
                        })
                        logger.debug(f"ASR result: {result_text} (final={is_final})")

                elif action == "task-finished":
                    await client_ws.send_json({"type": "status", "status": "stopped"})
                    logger.info("DashScope ASR task finished")

                elif action == "task-failed":
                    error_msg = msg.get("header", {}).get("error_message", "未知错误")
                    await client_ws.send_json({"type": "error", "message": error_msg})
                    logger.error(f"DashScope ASR task failed: {error_msg}")

        # 并行运行两个方向
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(client_to_dashscope()),
                asyncio.create_task(dashscope_to_client()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # 清理未完成的任务
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        logger.info("客户端断开连接")
    except Exception as e:
        logger.error(f"ASR WebSocket 错误: {e}")
        try:
            await client_ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if dashscope_ws:
            await dashscope_ws.close()
        try:
            await client_ws.close()
        except Exception:
            pass
        logger.info("ASR WebSocket 已关闭")
