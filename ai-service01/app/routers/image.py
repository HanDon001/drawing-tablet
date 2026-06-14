"""POST /image/generate — DashScope 文生图"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
from ..services import image_service

router = APIRouter(prefix="/ai/v1/image", tags=["image"])


class GenerateRequest(BaseModel):
    prompt: str
    style: str = "realistic"
    size: str = "1024*1024"


@router.post("/generate")
async def generate_image(req: GenerateRequest):
    """生成图片，直接返回图片URL"""
    try:
        image_url = await image_service.generate(req.prompt, req.style, req.size)
        return {
            "status": "success",
            "image_url": image_url,
            "prompt": req.prompt,
            "style": req.style
        }
    except Exception as e:
        logger.error(f"图片生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
