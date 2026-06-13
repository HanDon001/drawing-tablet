"""
POST /voice/asr  — 音频 → ASR → 文字
POST /voice/tts  — 文字 → TTS → 音频流
日志前缀: [VOICE]
"""

import io
import base64
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from ..schemas.voice import ASRRequest, ASRResponse, TTSRequest
from ..services import asr_service, tts_service
from ..exceptions import ASRError, TTSError

router = APIRouter(prefix="/ai/v1/voice", tags=["voice"])


def _convert_to_wav(audio_bytes: bytes, input_format: str = "webm") -> bytes:
    import av
    input_buffer = io.BytesIO(audio_bytes)
    container = av.open(input_buffer, format=input_format)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)

    pcm_frames = []
    for frame in container.decode(audio=0):
        for r in resampler.resample(frame):
            pcm_frames.append(bytes(r.planes[0]))
    container.close()

    pcm_data = b"".join(pcm_frames)
    if not pcm_data:
        raise ASRError("音频解码失败：无有效数据")

    # WAV header (44 bytes)
    sr, ch, bps = 16000, 1, 16
    byte_rate = sr * ch * bps // 8
    block_align = ch * bps // 8
    wav = io.BytesIO()
    wav.write(b"RIFF")
    wav.write((36 + len(pcm_data)).to_bytes(4, "little"))
    wav.write(b"WAVE")
    wav.write(b"fmt \x10\x00\x00\x00\x01\x00")
    wav.write(ch.to_bytes(2, "little"))
    wav.write(sr.to_bytes(4, "little"))
    wav.write(byte_rate.to_bytes(4, "little"))
    wav.write(block_align.to_bytes(2, "little"))
    wav.write(bps.to_bytes(2, "little"))
    wav.write(b"data")
    wav.write(len(pcm_data).to_bytes(4, "little"))
    wav.write(pcm_data)
    return wav.getvalue()


@router.post("/asr", response_model=ASRResponse)
async def speech_to_text(req: ASRRequest, http_request: Request):
    rid = http_request.headers.get("X-Request-ID", "?")[-8:]
    logger.info(f"[VOICE] [{rid}] ASR 请求: mime={req.mime_type}, size={len(req.audio_data)}chars")

    audio_bytes = base64.b64decode(req.audio_data)
    mime = req.mime_type.split(";")[0]
    logger.info(f"[VOICE] [{rid}] 解码: {len(audio_bytes)} bytes, mime={mime}")

    if mime == "audio/pcm":
        # 前端 VAD 已转好 Int16 PCM，直接用
        pcm_data = audio_bytes
        logger.info(f"[VOICE] [{rid}] PCM 直接使用: {len(pcm_data)} bytes")
    elif mime in ("audio/webm", "audio/ogg", "audio/mp4", "audio/m4a"):
        fmt_map = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/m4a": "mp4"}
        logger.info(f"[VOICE] [{rid}] 转换 {mime} → WAV")
        wav_bytes = _convert_to_wav(audio_bytes, fmt_map.get(mime, "webm"))
        pcm_data = wav_bytes[44:] if len(wav_bytes) > 44 else wav_bytes
        logger.info(f"[VOICE] [{rid}] PCM: {len(pcm_data)} bytes")
    else:
        pcm_data = audio_bytes
        logger.info(f"[VOICE] [{rid}] 直接使用: {len(pcm_data)} bytes")

    text = await asr_service.transcribe(pcm_data, rid)
    return ASRResponse(text=text)


@router.post("/tts")
async def text_to_speech(req: TTSRequest, http_request: Request):
    rid = http_request.headers.get("X-Request-ID", "?")[-8:]
    logger.info(f"[VOICE] [{rid}] TTS: '{req.text[:30]}' voice={req.voice}")

    wav_data = await tts_service.synthesize(req.text, req.voice, req.style)
    return StreamingResponse(iter([wav_data]), media_type="audio/wav")
