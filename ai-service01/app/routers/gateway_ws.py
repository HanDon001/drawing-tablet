"""
WS /gateway — AI 陪伴模式主通道
VAD(前端) → ASR → LLM → 结果
日志前缀: [GW]
"""

import json
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from ..services import asr_service, llm_service
from ..exceptions import ASRError, LLMError

router = APIRouter(prefix="/ai/v1", tags=["gateway"])


@router.websocket("/gateway")
async def gateway_ws(ws: WebSocket):
    await ws.accept()
    logger.info("[GW] 客户端已连接")

    asr = asr_service.ASRSession()
    processing = False
    start_time = time.time()
    audio_count = 0
    last_canvas_context = None  # 缓存最新的画布上下文
    last_audio_time = 0  # 上次收到音频的时间
    commit_task = None  # 周期性commit任务

    async def send_json(data: dict):
        try:
            await ws.send_text(json.dumps(data, ensure_ascii=False))
        except Exception:
            pass

    async def process_text(text: str, is_proactive: bool = False, canvas_context: str = None):
        nonlocal processing, last_audio_time
        if processing:
            logger.warning(f"[GW] LLM 忙，跳过: '{text[:30]}'")
            return
        processing = True
        last_audio_time = 0  # 重置，防止TTS播放期间误commit
        await send_json({"type": "status", "state": "processing"})
        try:
            logger.info(f"[GW] LLM 处理: '{text[:50]}' canvas='{canvas_context[:50] if canvas_context else 'None'}'")
            result = await llm_service.chat(text, canvas_context, is_proactive=is_proactive)
            if result.get("actions"):
                await send_json({"type": "actions", "actions": result["actions"]})
            if result.get("reply"):
                reply_type = "proactive_reply" if is_proactive else "reply"
                await send_json({"type": reply_type, "text": result["reply"]})
        except LLMError as e:
            logger.error(f"[GW] LLM 错误: {e.message}")
            await send_json({"type": "reply", "text": "抱歉，处理出错了"})
        except Exception as e:
            logger.error(f"[GW] 未预期错误: {type(e).__name__}: {e}")
            await send_json({"type": "reply", "text": "抱歉，处理出错了"})
        processing = False

    # 连接 ASR
    try:
        await asr.connect()
        asr.on_result(
            on_partial=lambda t: asyncio.create_task(send_json({"type": "partial", "text": t})),
            on_final=lambda t: asyncio.create_task(_on_final(t)),
        )
        await asr.start_listening()
        await send_json({"type": "status", "state": "listening"})
        logger.info("[GW] ASR 就绪，等待 VAD 触发")
    except ASRError as e:
        logger.error(f"[GW] ASR 连接失败: {e.message}")
        await send_json({"type": "error", "message": e.message})
        await send_json({"type": "status", "state": "error"})
    except Exception as e:
        logger.error(f"[GW] ASR 连接异常: {type(e).__name__}: {e}")
        await send_json({"type": "error", "message": f"ASR 连接失败: {e}"})
        await send_json({"type": "status", "state": "error"})

    async def _on_final(text: str):
        logger.info(f"[GW] ASR 最终: '{text}' canvas='{last_canvas_context[:50] if last_canvas_context else 'None'}'")
        await send_json({"type": "final", "text": text})
        asyncio.create_task(process_text(text, canvas_context=last_canvas_context))

    # 周期性commit任务：每1秒检查，用户停顿4秒后commit触发ASR识别
    async def periodic_commit():
        nonlocal last_audio_time
        while True:
            await asyncio.sleep(1.0)
            # 如果正在处理LLM，跳过commit
            if processing:
                continue
            # 用户停顿4秒后commit，让ASR返回完整的final结果
            if last_audio_time > 0 and (time.time() - last_audio_time) > 4.0:
                try:
                    await asr.commit()
                    logger.info("[GW] 用户停顿4秒，commit触发识别")
                except Exception as e:
                    logger.warning(f"[GW] commit 失败: {e}")
                last_audio_time = 0  # 重置，等待新的音频活动

    commit_task = asyncio.create_task(periodic_commit())

    # 主循环
    try:
        while True:
            try:
                data = await ws.receive()
            except Exception:
                break

            if "bytes" in data and data["bytes"]:
                audio_count += 1
                last_audio_time = time.time()
                await asr.send_audio(data["bytes"])
                if audio_count % 20 == 1:
                    elapsed = time.time() - start_time
                    logger.info(f"[GW] 音频: {audio_count} 块, {elapsed:.0f}s")

            elif "text" in data:
                try:
                    msg = json.loads(data["text"])
                    action = msg.get("action")
                    logger.debug(f"[GW] 指令: {action}")

                    if action == "speech_end":
                        logger.info("[GW] speech_end → commit")
                        await asr.commit()

                    elif action == "proactive":
                        logger.info("[GW] 主动搭话")
                        asyncio.create_task(process_text(
                            "用户已沉默20秒，用一句温暖的话引导用户继续创作，不要催促。", is_proactive=True
                        ))

                    elif action == "text":
                        text = msg.get("text", "")
                        canvas_ctx = msg.get("canvas_context")
                        if canvas_ctx:
                            last_canvas_context = canvas_ctx
                        if text:
                            logger.info(f"[GW] 文字输入: '{text}' canvas='{canvas_ctx[:50] if canvas_ctx else 'None'}'")
                            asyncio.create_task(process_text(text, canvas_context=canvas_ctx))

                    elif action == "stop":
                        logger.info("[GW] stop")
                        break
                except json.JSONDecodeError:
                    logger.warning(f"[GW] JSON 解析失败: {data['text'][:100]}")

    except WebSocketDisconnect:
        logger.info("[GW] 客户端断开")
    except Exception as e:
        logger.error(f"[GW] 主循环异常: {type(e).__name__}: {e}")
    finally:
        if commit_task:
            commit_task.cancel()
            try:
                await commit_task
            except asyncio.CancelledError:
                pass
        await asr.close()
        elapsed = time.time() - start_time
        logger.info(f"[GW] 已关闭: {elapsed:.0f}s, {audio_count} 块")
