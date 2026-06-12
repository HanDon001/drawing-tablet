"""
语音服务 API 路由
代理小米 MiMo ASR/TTS 请求
"""

import httpx
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from loguru import logger

from app.core.config import settings

router = APIRouter(prefix="/ai/v1/voice", tags=["voice"])


class ASRRequest(BaseModel):
    """ASR 请求模型"""
    audio_data: str = Field(..., description="Base64 编码的音频数据")
    mime_type: str = Field(default="audio/webm", description="音频 MIME 类型")
    language: str = Field(default="auto", description="语言")


class ASRResponse(BaseModel):
    """ASR 响应模型"""
    text: str = Field(..., description="识别的文本")


class TTSRequest(BaseModel):
    """TTS 请求模型"""
    text: str = Field(..., description="要合成的文本")
    voice: str = Field(default="Chloe", description="语音名称")
    style: Optional[str] = Field(
        default="Bright, bouncy, slightly sing-song tone",
        description="语音风格描述"
    )


@router.post("/asr")
async def speech_to_text(request: ASRRequest, http_request: Request):
    """
    语音识别 (ASR)

    代理小米 MiMo ASR API 请求
    """
    request_id = http_request.headers.get("X-Request-ID", "unknown")
    logger.info(f"[{request_id}] ASR 请求: mime_type={request.mime_type}, language={request.language}")

    try:
        # 构建小米 API 请求
        payload = {
            "model": "mimo-v2.5-asr",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": f"data:{request.mime_type};base64,{request.audio_data}"
                            }
                        }
                    ]
                }
            ],
            "asr_options": {
                "language": request.language
            },
            "stream": False  # 非流式响应，简化处理
        }

        headers = {
            "api-key": settings.MIMO_API_KEY,
            "Content-Type": "application/json"
        }

        # 调用小米 API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.MIMO_API_BASE}/chat/completions",
                json=payload,
                headers=headers
            )

            if response.status_code != 200:
                logger.error(f"[{request_id}] ASR API 错误: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail="语音识别失败")

            result = response.json()

            # 解析响应
            text = ""
            if "choices" in result and len(result["choices"]) > 0:
                message = result["choices"][0].get("message", {})
                text = message.get("content", "")

            logger.info(f"[{request_id}] ASR 结果: {text}")
            return ASRResponse(text=text)

    except httpx.TimeoutException:
        logger.error(f"[{request_id}] ASR 请求超时")
        raise HTTPException(status_code=504, detail="语音识别超时")
    except Exception as e:
        logger.error(f"[{request_id}] ASR 错误: {str(e)}")
        raise HTTPException(status_code=500, detail="语音识别失败")


@router.post("/tts")
async def text_to_speech(request: TTSRequest, http_request: Request):
    """
    语音合成 (TTS)

    代理小米 MiMo TTS API 请求，返回音频流
    """
    request_id = http_request.headers.get("X-Request-ID", "unknown")
    logger.info(f"[{request_id}] TTS 请求: text={request.text}, voice={request.voice}")

    try:
        # 构建小米 API 请求
        payload = {
            "model": "mimo-v2.5-tts",
            "messages": [
                {
                    "role": "user",
                    "content": request.style or "Bright, bouncy, slightly sing-song tone"
                },
                {
                    "role": "assistant",
                    "content": request.text
                }
            ],
            "audio": {
                "format": "pcm16",
                "voice": request.voice
            },
            "stream": True
        }

        headers = {
            "api-key": settings.MIMO_API_KEY,
            "Content-Type": "application/json"
        }

        # 调用小米 API（流式响应）
        async def generate_audio():
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.MIMO_API_BASE}/chat/completions",
                    json=payload,
                    headers=headers
                ) as response:
                    if response.status_code != 200:
                        logger.error(f"[{request_id}] TTS API 错误: {response.status_code}")
                        yield b""
                        return

                    async for chunk in response.aiter_bytes():
                        yield chunk

        logger.info(f"[{request_id}] TTS 流式响应开始")
        return StreamingResponse(
            generate_audio(),
            media_type="audio/pcm",
            headers={
                "X-Request-ID": request_id,
                "Content-Type": "audio/pcm; rate=24000; channels=1"
            }
        )

    except httpx.TimeoutException:
        logger.error(f"[{request_id}] TTS 请求超时")
        raise HTTPException(status_code=504, detail="语音合成超时")
    except Exception as e:
        logger.error(f"[{request_id}] TTS 错误: {str(e)}")
        raise HTTPException(status_code=500, detail="语音合成失败")
