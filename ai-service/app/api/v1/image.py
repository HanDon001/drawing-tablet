"""
图像生成 API
接入 DashScope 通义万相 / Flux 图像生成模型
"""

import httpx
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from loguru import logger

from app.core.config import settings

router = APIRouter(prefix="/ai/v1", tags=["image"])

# DashScope 图像生成 API
DASHSCOPE_IMAGE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks"


class ImageGenerateRequest(BaseModel):
    """图像生成请求"""
    prompt: str = Field(..., description="图像描述", min_length=1, max_length=500)
    style: str = Field(default="realistic", description="风格: realistic/cartoon/anime/watercolor/oil")
    size: str = Field(default="1024*1024", description="图片尺寸: 1024*1024/720*1280/1280*720")
    n: int = Field(default=1, description="生成数量", ge=1, le=4)


class ImageGenerateResponse(BaseModel):
    """图像生成响应"""
    status: str = Field(..., description="状态: success/pending/failed")
    image_url: str = Field(default="", description="图片URL（成功时）")
    task_id: str = Field(default="", description="任务ID（异步时）")
    message: str = Field(default="", description="提示信息")


# 风格提示词增强
STYLE_PROMPTS = {
    "realistic": "高清写实风格，精细细节，摄影级画质",
    "cartoon": "卡通可爱风格，色彩鲜艳，线条简洁",
    "anime": "日系动漫风格，精致细腻，唯美",
    "watercolor": "水彩画风格，色彩通透，笔触自然",
    "oil": "油画风格，色彩浓郁，笔触厚重",
    "sketch": "素描风格，铅笔线条，黑白灰",
    "pixel": "像素风格，复古游戏画面",
    "chinese": "中国水墨画风格，意境深远，墨色淡雅",
}


@router.post("/image/generate", response_model=ImageGenerateResponse)
async def generate_image(request: ImageGenerateRequest):
    """
    生成图片

    调用 DashScope Flux 模型，根据文字描述生成图片。
    支持同步和异步两种模式。
    """
    logger.info(f"图像生成请求: prompt='{request.prompt}', style='{request.style}', size='{request.size}'")

    # 增强 prompt（添加风格描述）
    style_desc = STYLE_PROMPTS.get(request.style, "")
    enhanced_prompt = request.prompt
    if style_desc:
        enhanced_prompt = f"{request.prompt}，{style_desc}"

    try:
        headers = {
            "Authorization": f"bearer {settings.DASHSCOPE_API_KEY}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",  # 使用异步模式
        }

        payload = {
            "model": "flux-schnell",
            "input": {
                "prompt": enhanced_prompt
            },
            "parameters": {
                "size": request.size,
                "n": request.n,
                "seed": None,  # 随机种子
            }
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(DASHSCOPE_IMAGE_URL, json=payload, headers=headers)
            data = resp.json()

            logger.info(f"DashScope 响应: {data}")

            # 检查响应
            if resp.status_code != 200:
                error_msg = data.get("message", f"HTTP {resp.status_code}")
                logger.error(f"DashScope 错误: {error_msg}")
                return ImageGenerateResponse(
                    status="failed",
                    message=f"图像生成失败: {error_msg}"
                )

            # 异步模式：返回任务 ID
            output = data.get("output", {})
            task_id = output.get("task_id", "")

            if task_id:
                task_status = output.get("task_status", "")

                if task_status == "SUCCEEDED":
                    # 已完成
                    results = output.get("results", [])
                    if results:
                        image_url = results[0].get("url", "")
                        return ImageGenerateResponse(
                            status="success",
                            image_url=image_url
                        )

                elif task_status == "PENDING" or task_status == "RUNNING":
                    # 异步进行中
                    return ImageGenerateResponse(
                        status="pending",
                        task_id=task_id,
                        message="图片生成中，请稍候..."
                    )

                elif task_status == "FAILED":
                    return ImageGenerateResponse(
                        status="failed",
                        message=output.get("message", "生成失败")
                    )

            # 同步模式：直接返回结果
            results = output.get("results", [])
            if results:
                image_url = results[0].get("url", "")
                return ImageGenerateResponse(
                    status="success",
                    image_url=image_url
                )

            return ImageGenerateResponse(
                status="failed",
                message="未获取到生成结果"
            )

    except httpx.TimeoutException:
        logger.error("DashScope 请求超时")
        return ImageGenerateResponse(
            status="failed",
            message="请求超时，请稍后重试"
        )
    except Exception as e:
        logger.error(f"图像生成错误: {e}")
        return ImageGenerateResponse(
            status="failed",
            message=f"生成出错: {str(e)}"
        )


@router.get("/image/task/{task_id}", response_model=ImageGenerateResponse)
async def get_task_result(task_id: str):
    """
    查询异步任务结果

    轮询 DashScope 异步任务状态，返回生成结果。
    """
    try:
        headers = {
            "Authorization": f"bearer {settings.DASHSCOPE_API_KEY}",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{DASHSCOPE_TASK_URL}/{task_id}", headers=headers)
            data = resp.json()

            output = data.get("output", {})
            task_status = output.get("task_status", "")

            if task_status == "SUCCEEDED":
                results = output.get("results", [])
                if results:
                    return ImageGenerateResponse(
                        status="success",
                        image_url=results[0].get("url", "")
                    )
                return ImageGenerateResponse(status="failed", message="无结果")

            elif task_status == "FAILED":
                return ImageGenerateResponse(
                    status="failed",
                    message=output.get("message", "生成失败")
                )

            else:
                return ImageGenerateResponse(
                    status="pending",
                    task_id=task_id,
                    message="生成中..."
                )

    except Exception as e:
        logger.error(f"查询任务状态错误: {e}")
        return ImageGenerateResponse(
            status="failed",
            message=f"查询失败: {str(e)}"
        )
