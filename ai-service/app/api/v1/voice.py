"""
语音服务 API 路由
ASR: MiMo API + PyAV 格式转换
TTS: MiMo API
"""

import httpx
import base64
import io
import asyncio
from hashlib import md5
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from loguru import logger

from app.core.config import settings

router = APIRouter(prefix="/ai/v1/voice", tags=["voice"])

# TTS 音频缓存 {cache_key: bytes}
_tts_cache: dict[str, bytes] = {}
_tts_cache_lock = asyncio.Lock()

# 高频回复预热列表
WARMUP_PHRASES = [
    "好的，已经在画布上绘制了",
    "已撤销上一步操作",
    "画布已清空",
    "抱歉，我没有理解您的意思",
    "好的，我安静",
    "画布上还没有任何图形",
]


class ASRRequest(BaseModel):
    audio_data: str = Field(..., description="Base64 编码的音频数据")
    mime_type: str = Field(default="audio/webm", description="音频 MIME 类型")
    language: str = Field(default="auto", description="语言")


class ASRResponse(BaseModel):
    text: str = Field(..., description="识别的文本")


class TTSRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    voice: str = Field(default="Chloe", description="语音名称")
    style: Optional[str] = Field(
        default="Bright, bouncy, slightly sing-song tone",
        description="语音风格描述"
    )


def convert_to_wav(audio_bytes: bytes, input_format: str = "webm") -> bytes:
    """
    使用 PyAV 将任意音频格式转换为 WAV (16kHz mono PCM16)
    """
    import av

    # 读取输入音频
    input_buffer = io.BytesIO(audio_bytes)
    input_container = av.open(input_buffer, format=input_format)

    # 解码所有音频帧
    resampler = av.AudioResampler(
        format="s16",       # PCM 16-bit
        layout="mono",      # 单声道
        rate=16000,         # 16kHz
    )

    pcm_frames = []
    for frame in input_container.decode(audio=0):
        # 重采样
        resampled = resampler.resample(frame)
        for r in resampled:
            pcm_frames.append(bytes(r.planes[0]))

    input_container.close()

    # 拼接 PCM 数据
    pcm_data = b"".join(pcm_frames)

    if not pcm_data:
        raise ValueError("音频解码失败：无有效音频数据")

    # 构建 WAV 文件
    sample_rate = 16000
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_data)

    wav = io.BytesIO()
    # RIFF header
    wav.write(b"RIFF")
    wav.write((36 + data_size).to_bytes(4, "little"))
    wav.write(b"WAVE")
    # fmt chunk
    wav.write(b"fmt ")
    wav.write((16).to_bytes(4, "little"))
    wav.write((1).to_bytes(2, "little"))         # PCM
    wav.write(num_channels.to_bytes(2, "little"))
    wav.write(sample_rate.to_bytes(4, "little"))
    wav.write(byte_rate.to_bytes(4, "little"))
    wav.write(block_align.to_bytes(2, "little"))
    wav.write(bits_per_sample.to_bytes(2, "little"))
    # data chunk
    wav.write(b"data")
    wav.write(data_size.to_bytes(4, "little"))
    wav.write(pcm_data)

    return wav.getvalue()


@router.post("/asr")
async def speech_to_text(request: ASRRequest, http_request: Request):
    """
    语音识别 (ASR)

    前端发送 webm/wav/mp3 → PyAV 转 WAV → MiMo ASR
    """
    request_id = http_request.headers.get("X-Request-ID", "unknown")
    logger.info(f"[{request_id}] ASR 请求: mime_type={request.mime_type}")

    try:
        audio_bytes = base64.b64decode(request.audio_data)
        logger.info(f"[{request_id}] 收到音频: {len(audio_bytes)} bytes")

        # 判断是否需要转换
        mime = request.mime_type.split(";")[0]  # 去掉 codecs 部分
        if mime in ("audio/webm", "audio/ogg", "audio/mp4", "audio/m4a"):
            # 需要转换为 WAV
            fmt_map = {
                "audio/webm": "webm",
                "audio/ogg": "ogg",
                "audio/mp4": "mp4",
                "audio/m4a": "mp4",
            }
            input_fmt = fmt_map.get(mime, "webm")
            logger.info(f"[{request_id}] 转换 {mime} → WAV ...")
            wav_bytes = convert_to_wav(audio_bytes, input_fmt)
            audio_b64 = base64.b64encode(wav_bytes).decode()
            send_mime = "audio/wav"
            logger.info(f"[{request_id}] 转换完成: {len(wav_bytes)} bytes")
        else:
            # 已经是 wav/mp3/mpeg，直接透传
            audio_b64 = request.audio_data
            send_mime = mime

        # 调用 MiMo ASR
        payload = {
            "model": "mimo-v2.5-asr",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": f"data:{send_mime};base64,{audio_b64}"
                            },
                        }
                    ],
                }
            ],
            "asr_options": {"language": request.language},
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.MIMO_API_BASE}/v1/chat/completions",
                json=payload,
                headers={"api-key": settings.MIMO_API_KEY, "Content-Type": "application/json"},
            )

        if response.status_code != 200:
            logger.error(f"[{request_id}] MiMo ASR 错误: {response.status_code} - {response.text}")
            raise HTTPException(status_code=500, detail="语音识别失败")

        result = response.json()
        text = ""
        if result.get("choices"):
            text = result["choices"][0].get("message", {}).get("content", "")

        logger.info(f"[{request_id}] ASR 结果: {text}")
        return ASRResponse(text=text)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{request_id}] ASR 错误: {str(e)}")
        raise HTTPException(status_code=500, detail="语音识别失败")


def _tts_cache_key(text: str, voice: str) -> str:
    return md5(f"{text}:{voice}".encode()).hexdigest()


async def _fetch_tts_audio(text: str, voice: str, style: str) -> bytes:
    """调用 MiMo TTS 并收集完整音频"""
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": style},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "pcm16", "voice": voice},
        "stream": True,
    }

    audio_parts = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{settings.MIMO_API_BASE}/v1/chat/completions",
            json=payload,
            headers={"api-key": settings.MIMO_API_KEY, "Content-Type": "application/json"},
        ) as response:
            if response.status_code != 200:
                raise Exception(f"TTS API 错误: {response.status_code}")
            async for chunk in response.aiter_bytes():
                audio_parts.append(chunk)

    return b"".join(audio_parts)


@router.post("/tts")
async def text_to_speech(request: TTSRequest, http_request: Request):
    """TTS 语音合成 - MiMo API，带缓存"""
    request_id = http_request.headers.get("X-Request-ID", "unknown")
    cache_key = _tts_cache_key(request.text, request.voice)

    # 命中缓存直接返回
    async with _tts_cache_lock:
        cached = _tts_cache.get(cache_key)
    if cached:
        logger.info(f"[{request_id}] TTS 缓存命中: {request.text[:20]}...")
        return StreamingResponse(iter([cached]), media_type="audio/pcm")

    logger.info(f"[{request_id}] TTS 请求: {request.text[:30]}...")

    try:
        style = request.style or "Bright, bouncy, slightly sing-song tone"
        audio_bytes = await _fetch_tts_audio(request.text, request.voice, style)

        # 写入缓存
        async with _tts_cache_lock:
            _tts_cache[cache_key] = audio_bytes

        return StreamingResponse(iter([audio_bytes]), media_type="audio/pcm")

    except Exception as e:
        logger.error(f"[{request_id}] TTS 错误: {str(e)}")
        raise HTTPException(status_code=500, detail="语音合成失败")


@router.post("/tts/warmup")
async def tts_warmup():
    """预热高频回复缓存"""
    warmed = 0
    for phrase in WARMUP_PHRASES:
        cache_key = _tts_cache_key(phrase, "Chloe")
        async with _tts_cache_lock:
            if cache_key in _tts_cache:
                continue
        try:
            audio = await _fetch_tts_audio(phrase, "Chloe", "Bright, bouncy, slightly sing-song tone")
            async with _tts_cache_lock:
                _tts_cache[cache_key] = audio
            warmed += 1
            logger.info(f"TTS 预热: {phrase}")
        except Exception as e:
            logger.warning(f"TTS 预热失败: {phrase} - {e}")

    return {"warmed": warmed, "total": len(WARMUP_PHRASES)}
