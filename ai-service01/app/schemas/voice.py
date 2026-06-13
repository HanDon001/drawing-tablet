"""语音服务数据模型"""

from pydantic import BaseModel, Field
from typing import Optional


class ASRRequest(BaseModel):
    audio_data: str = Field(..., description="Base64 编码的音频数据")
    mime_type: str = Field(default="audio/webm", description="音频 MIME 类型")
    language: str = Field(default="auto", description="语言")


class ASRResponse(BaseModel):
    text: str = Field(..., description="识别的文本")


class TTSRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    voice: str = Field(default="Chloe", description="语音名称")
    style: Optional[str] = Field(default="Bright, bouncy, slightly sing-song tone")


class InterpretRequest(BaseModel):
    text: str = Field(..., description="用户指令文本")
    canvas_context: Optional[str] = Field(default=None, description="画布上下文")


class InterpretResponse(BaseModel):
    reply: str = ""
    actions: list = []
