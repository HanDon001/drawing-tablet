"""POST /image/generate, GET /image/task/{id}"""

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
    try:
        task_id = await image_service.generate(req.prompt, req.style, req.size)
        return {"status": "pending", "task_id": task_id}
    except Exception as e:
        logger.error(f"图片生成失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/task/{task_id}")
async def get_task(task_id: str):
    result = await image_service.poll(task_id)
    return result
