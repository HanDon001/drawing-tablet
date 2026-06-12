"""
全链路 WebSocket 网关
音频 → ASR → LLM → TTS，单管道，零 HTTP 往返

协议:
- 客户端发送二进制: PCM 音频数据 (16kHz, 16bit, mono)
- 客户端发送文本: JSON 控制指令
- 服务端推送: JSON 结果 + 二进制 TTS 音频
"""

import json
import asyncio
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.config import settings
from app.core.agent import Agent
from app.core.tool_registry import ToolRegistry

router = APIRouter(prefix="/ai/v1", tags=["gateway"])

DASHSCOPE_ASR_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"


@router.websocket("/gateway")
async def gateway_ws(ws: WebSocket):
    """
    全链路网关: 音频 → ASR → 语义分块 → LLM → 结果

    客户端 → 服务端:
        二进制: PCM 音频帧
        文本: {"action": "start"} / {"action": "stop"} / {"type": "text", "text": "..."}

    服务端 → 客户端:
        {"type": "partial", "text": "..."}       # ASR 增量
        {"type": "final", "text": "..."}          # ASR 最终
        {"type": "actions", "actions": [...]}     # LLM 动作
        {"type": "reply", "text": "..."}          # LLM 回复
        {"type": "status", "state": "..."}        # 状态变更
    """
    await ws.accept()
    logger.info("全链路网关已连接")

    agent = Agent()
    asr_ws = None
    asr_task = None
    processing = False

    # 语义分块状态
    chunk_buffer = ""
    last_flush_time = 0

    async def send_json(data: dict):
        try:
            await ws.send_text(json.dumps(data, ensure_ascii=False))
        except Exception:
            pass

    async def process_text(text: str):
        """LLM 处理一段完整文本"""
        nonlocal processing
        if processing:
            return
        processing = True

        await send_json({"type": "status", "state": "processing"})

        try:
            result = await agent.chat(text, None)

            if result.get("actions"):
                await send_json({"type": "actions", "actions": result["actions"]})

            if result.get("reply"):
                await send_json({"type": "reply", "text": result["reply"]})

        except Exception as e:
            logger.error(f"LLM 处理错误: {e}")
            await send_json({"type": "reply", "text": "抱歉，处理出错了"})

        processing = False
        await send_json({"type": "status", "state": "listening"})

    async def connect_asr():
        """连接 DashScope ASR WebSocket"""
        nonlocal asr_ws
        headers = {
            "Authorization": f"bearer {settings.DASHSCOPE_API_KEY}",
            "X-DashScope-DataInspection": "enable",
        }
        asr_ws = await websockets.connect(DASHSCOPE_WS_URL, extra_headers=headers, max_size=10*1024*1024)

        # 发送 run-task
        await asr_ws.send(json.dumps({
            "header": {"action": "run-task", "task_id": "gw-001", "streaming": "duplex"},
            "payload": {
                "task_group": "audio", "task": "asr", "function": "recognition",
                "model": "paraformer-realtime-v2",
                "parameters": {"format": "pcm", "sample_rate": 16000, "vad_segmentation": True},
                "input": {},
            },
        }))
        logger.info("ASR WebSocket 已连接")

    async def listen_asr():
        """监听 ASR 结果"""
        nonlocal chunk_buffer, last_flush_time
        import time

        try:
            while asr_ws and asr_ws.open:
                raw = await asr_ws.recv()
                if isinstance(raw, bytes):
                    continue

                msg = json.loads(raw)
                action = msg.get("header", {}).get("action", "")

                if action == "task-started":
                    await send_json({"type": "status", "state": "listening"})

                elif action == "result-generated":
                    text = msg.get("payload", {}).get("output", {}).get("text", "")
                    sentence = msg.get("payload", {}).get("output", {}).get("sentence", "")
                    result_text = sentence or text

                    if not result_text:
                        continue

                    is_final = msg.get("header", {}).get("event", "") == "task-finished"

                    if is_final:
                        # 最终结果 → 立即分块
                        await send_json({"type": "final", "text": result_text})
                        chunk_buffer = result_text
                        asyncio.create_task(process_text(chunk_buffer))
                        chunk_buffer = ""
                    else:
                        # 增量结果
                        await send_json({"type": "partial", "text": result_text})
                        chunk_buffer = result_text

                        # 简单分块：标点触发
                        now = time.time()
                        if any(p in result_text for p in "。！？；"):
                            if chunk_buffer.strip():
                                asyncio.create_task(process_text(chunk_buffer.strip()))
                                chunk_buffer = ""
                                last_flush_time = now

                elif action == "task-finished":
                    await send_json({"type": "status", "state": "idle"})

                elif action == "task-failed":
                    err = msg.get("header", {}).get("error_message", "未知错误")
                    logger.error(f"ASR 错误: {err}")
                    await send_json({"type": "error", "message": err})

        except (websockets.ConnectionClosed, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.error(f"ASR 监听错误: {e}")

    try:
        # 连接 ASR
        await connect_asr()
        asr_task = asyncio.create_task(listen_asr())

        # 主循环：接收前端消息
        while True:
            try:
                data = await ws.receive()
            except Exception:
                break

            # 二进制: PCM 音频 → 转发到 ASR
            if "bytes" in data and data["bytes"]:
                if asr_ws and asr_ws.open:
                    await asr_ws.send(data["bytes"])

            # 文本: 控制指令
            elif "text" in data:
                try:
                    msg = json.loads(data["text"])
                    action = msg.get("action")

                    if action == "stop":
                        # 结束当前 ASR 任务
                        if asr_ws and asr_ws.open:
                            await asr_ws.send(json.dumps({
                                "header": {"action": "finish-task", "task_id": "gw-001", "streaming": "duplex"},
                                "payload": {"input": {}},
                            }))

                        # 处理剩余缓冲
                        if chunk_buffer.strip():
                            asyncio.create_task(process_text(chunk_buffer.strip()))
                            chunk_buffer = ""

                    elif action == "text":
                        # 直接文字输入
                        text = msg.get("text", "")
                        if text:
                            asyncio.create_task(process_text(text))

                    elif action == "canvas":
                        # 画布同步
                        pass

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("网关客户端断开")
    except Exception as e:
        logger.error(f"网关错误: {e}")
    finally:
        if asr_task:
            asr_task.cancel()
            try:
                await asr_task
            except asyncio.CancelledError:
                pass
        if asr_ws:
            await asr_ws.close()
        logger.info("全链路网关已关闭")
