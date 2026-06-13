"""POST /interpret — 文字指令 → LLM → 回复 + 动作"""

from fastapi import APIRouter
from loguru import logger
from ..schemas.voice import InterpretRequest, InterpretResponse
from ..services import llm_service

router = APIRouter(prefix="/ai/v1", tags=["agent"])


@router.post("/interpret", response_model=InterpretResponse)
async def interpret(req: InterpretRequest):
    logger.info(f"指令: text='{req.text}', canvas='{req.canvas_context}'")
    result = await llm_service.chat(req.text, req.canvas_context)
    return InterpretResponse(reply=result["reply"], actions=result["actions"])
