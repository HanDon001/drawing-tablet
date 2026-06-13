"""
ASR 服务 — DashScope Realtime WebSocket 语音识别
日志前缀: [ASR]
"""

import json
import base64
import asyncio
import websockets
from loguru import logger
from ..config import settings
from ..exceptions import ASRError


async def transcribe(pcm_data: bytes, request_id: str = "unknown") -> str:
    """一次性 ASR 识别"""
    url = f"{settings.ASR_REALTIME_URL}?model={settings.ASR_MODEL}"
    headers = {"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}"}

    logger.info(f"[ASR] [{request_id}] 连接: model={settings.ASR_MODEL}, 音频={len(pcm_data)}bytes")

    try:
        ws = await websockets.connect(url, extra_headers=headers, max_size=10*1024*1024)
    except Exception as e:
        logger.error(f"[ASR] [{request_id}] 连接失败: {e}")
        raise ASRError(f"ASR 连接失败: {e}")

    try:
        # session.created
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        msg = json.loads(raw)
        if msg.get("type") != "session.created":
            raise ASRError(f"期望 session.created，收到 {msg.get('type')}")
        logger.info(f"[ASR] [{request_id}] session 已创建")

        # session.update（必须，DashScope 要求）
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "instructions": "你是一个语音识别助手，只输出用户说话的文字内容。",
                "input_audio_format": "pcm",
                "input_audio_transcription": {"model": settings.ASR_MODEL},
                "turn_detection": {"type": "server_vad"},
            }
        }))
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        msg = json.loads(raw)
        if msg.get("type") != "session.updated":
            raise ASRError(f"期望 session.updated，收到 {msg.get('type')}: {msg.get('error',{}).get('message','')}")
        logger.info(f"[ASR] [{request_id}] session.updated")

        # 分块发送音频（小块 + 延迟，模拟实时流）
        chunk_size = 6400  # 200ms @ 16kHz 16bit
        chunks = 0
        for i in range(0, len(pcm_data), chunk_size):
            chunk = pcm_data[i:i + chunk_size]
            await ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(chunk).decode(),
            }))
            chunks += 1
            await asyncio.sleep(0.05)  # 50ms 延迟

        # 等待音频处理后再 commit
        await asyncio.sleep(0.5)
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        logger.info(f"[ASR] [{request_id}] 音频已发送: {chunks} 块, {len(pcm_data)} bytes")

        # 接收结果
        async with asyncio.timeout(30):
            while True:
                raw = await ws.recv()
                msg = json.loads(raw)
                msg_type = msg.get("type", "")

                if msg_type == "conversation.item.input_audio_transcription.completed":
                    text = msg.get("transcript", "")
                    logger.info(f"[ASR] [{request_id}] 识别结果: '{text}'")
                    return text

                if msg_type == "error":
                    err = msg.get("error", {}).get("message", "未知错误")
                    if "no invalid audio stream" in err or "committing" in err:
                        logger.warning(f"[ASR] [{request_id}] 未检测到语音: {err}")
                        return ""
                    logger.error(f"[ASR] [{request_id}] 服务端错误: {err}")
                    raise ASRError(f"ASR 错误: {err}")

        raise ASRError("ASR 超时无结果")

    except ASRError:
        raise
    except asyncio.TimeoutError:
        logger.error(f"[ASR] [{request_id}] 超时")
        raise ASRError("ASR 超时")
    except Exception as e:
        logger.error(f"[ASR] [{request_id}] 异常: {type(e).__name__}: {e}")
        raise ASRError(f"ASR 异常: {e}")
    finally:
        await ws.close()


class ASRSession:
    """持久 ASR 会话（gateway 实时流式）"""

    def __init__(self):
        self.ws = None
        self._listen_task = None
        self._on_partial = None
        self._on_final = None

    async def connect(self):
        url = f"{settings.ASR_REALTIME_URL}?model={settings.ASR_MODEL}"
        headers = {"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}"}

        logger.info(f"[ASR-WS] 连接: {url}")
        try:
            self.ws = await websockets.connect(url, extra_headers=headers, max_size=10*1024*1024)
        except Exception as e:
            logger.error(f"[ASR-WS] 连接失败: {e}")
            raise ASRError(f"ASR 连接失败: {e}")

        raw = await asyncio.wait_for(self.ws.recv(), timeout=5.0)
        msg = json.loads(raw)
        if msg.get("type") != "session.created":
            raise ASRError(f"期望 session.created，收到 {msg.get('type')}")

        logger.info(f"[ASR-WS] session 已创建: {msg.get('session',{}).get('id','?')}")

        # session.update
        await self.ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "instructions": "你是一个语音识别助手，只输出用户说话的文字内容。",
                "input_audio_format": "pcm",
                "input_audio_transcription": {"model": settings.ASR_MODEL},
                "turn_detection": {"type": "server_vad"},
            }
        }))
        raw = await asyncio.wait_for(self.ws.recv(), timeout=5.0)
        msg = json.loads(raw)
        if msg.get("type") != "session.updated":
            raise ASRError(f"期望 session.updated，收到 {msg.get('type')}")
        logger.info("[ASR-WS] session.updated")

    def on_result(self, on_partial=None, on_final=None):
        self._on_partial = on_partial
        self._on_final = on_final

    async def start_listening(self):
        self._listen_task = asyncio.create_task(self._listen_loop())

    async def _listen_loop(self):
        try:
            while self.ws and self.ws.open:
                raw = await self.ws.recv()
                msg = json.loads(raw)
                msg_type = msg.get("type", "")

                if msg_type == "conversation.item.input_audio_transcription.text":
                    partial = msg.get("stash", "")
                    if partial and self._on_partial:
                        self._on_partial(partial)

                elif msg_type == "conversation.item.input_audio_transcription.completed":
                    text = msg.get("transcript", "")
                    if text:
                        logger.info(f"[ASR-WS] 最终结果: '{text}'")
                    if text and self._on_final:
                        self._on_final(text)

                elif msg_type == "error":
                    err = msg.get("error", {}).get("message", "未知错误")
                    logger.error(f"[ASR-WS] 服务端错误: {err}")

        except websockets.ConnectionClosed as e:
            logger.warning(f"[ASR-WS] 连接关闭: {e.code}")
        except asyncio.CancelledError:
            logger.info("[ASR-WS] 监听已取消")
        except Exception as e:
            logger.error(f"[ASR-WS] 监听异常: {type(e).__name__}: {e}")

    async def send_audio(self, pcm_data: bytes):
        if self.ws and self.ws.open:
            b64 = base64.b64encode(pcm_data).decode()
            await self.ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": b64}))

    async def commit(self):
        if self.ws and self.ws.open:
            await self.ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
            logger.debug("[ASR-WS] commit")

    async def close(self):
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        if self.ws:
            await self.ws.close()
            logger.info("[ASR-WS] 已关闭")
