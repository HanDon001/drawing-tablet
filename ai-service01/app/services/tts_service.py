"""
TTS 服务 — MiMo 语音合成
日志前缀: [TTS]
MiMo 返回 SSE 格式，每个事件包含 base64 编码的 PCM 音频块
输出格式: WAV (浏览器 Audio 元素可直接播放)
"""

import io
import base64
import httpx
from loguru import logger
from ..config import settings
from ..exceptions import TTSError

SAMPLE_RATE = 24000  # MiMo TTS 输出 24kHz
CHANNELS = 1
BITS_PER_SAMPLE = 16


def _build_wav(pcm_data: bytes) -> bytes:
    """给 PCM 数据加 WAV 头"""
    byte_rate = SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE // 8
    block_align = CHANNELS * BITS_PER_SAMPLE // 8
    data_size = len(pcm_data)

    wav = io.BytesIO()
    wav.write(b"RIFF")
    wav.write((36 + data_size).to_bytes(4, "little"))
    wav.write(b"WAVE")
    wav.write(b"fmt ")
    wav.write((16).to_bytes(4, "little"))
    wav.write((1).to_bytes(2, "little"))
    wav.write(CHANNELS.to_bytes(2, "little"))
    wav.write(SAMPLE_RATE.to_bytes(4, "little"))
    wav.write(byte_rate.to_bytes(4, "little"))
    wav.write(block_align.to_bytes(2, "little"))
    wav.write(BITS_PER_SAMPLE.to_bytes(2, "little"))
    wav.write(b"data")
    wav.write(data_size.to_bytes(4, "little"))
    wav.write(pcm_data)
    return wav.getvalue()


async def synthesize(text: str, voice: str = None, style: str = None) -> bytes:
    """
    TTS 合成，返回完整 WAV 音频

    MiMo TTS 返回 SSE 格式:
    data: {"choices":[{"delta":{"audio":{"data":"base64pcm..."}}}]}
    """
    voice = voice or settings.TTS_VOICE
    style = style or "Bright, bouncy, slightly sing-song tone"

    logger.info(f"[TTS] 合成: '{text[:30]}...' voice={voice}")

    payload = {
        "model": settings.TTS_MODEL,
        "messages": [
            {"role": "user", "content": style},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "pcm16", "voice": voice},
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{settings.MIMO_API_BASE}/v1/chat/completions",
                json=payload,
                headers={"api-key": settings.MIMO_API_KEY, "Content-Type": "application/json"},
            ) as response:
                if response.status_code != 200:
                    logger.error(f"[TTS] HTTP {response.status_code}")
                    raise TTSError(f"TTS 请求失败: HTTP {response.status_code}")

                # 解析 SSE 提取音频数据
                pcm_data = b""
                event_count = 0
                buffer = ""

                async for chunk in response.aiter_text():
                    buffer += chunk
                    # SSE 事件以 \n\n 分隔
                    while "\n\n" in buffer:
                        event_str, buffer = buffer.split("\n\n", 1)
                        event_str = event_str.strip()
                        if not event_str.startswith("data: "):
                            continue

                        json_str = event_str[6:]  # 去掉 "data: " 前缀
                        if json_str == "[DONE]":
                            continue

                        try:
                            import json
                            event = json.loads(json_str)
                            choices = event.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                audio = delta.get("audio")
                                if audio and audio.get("data"):
                                    audio_b64 = audio["data"]
                                    audio_bytes = base64.b64decode(audio_b64)
                                    pcm_data += audio_bytes
                                    event_count += 1
                        except Exception:
                            continue

                logger.info(f"[TTS] 完成: {event_count} 个音频块, PCM {len(pcm_data)} bytes")

                if not pcm_data:
                    logger.error("[TTS] 未提取到音频数据")
                    raise TTSError("TTS 未返回音频数据")

                # 包装为 WAV
                wav_data = _build_wav(pcm_data)
                logger.info(f"[TTS] WAV {len(wav_data)} bytes, {SAMPLE_RATE}Hz")
                return wav_data

    except TTSError:
        raise
    except httpx.TimeoutException:
        logger.error("[TTS] 超时")
        raise TTSError("TTS 超时")
    except Exception as e:
        logger.error(f"[TTS] 异常: {type(e).__name__}: {e}")
        raise TTSError(f"TTS 异常: {e}")
