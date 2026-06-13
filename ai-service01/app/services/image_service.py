"""
图片生成服务 — DashScope Flux
日志前缀: [IMG]
"""

import httpx
from loguru import logger
from ..config import settings
from ..exceptions import ImageError

STYLE_PROMPTS = {
    "realistic": "photorealistic, highly detailed",
    "cartoon": "cartoon style, colorful",
    "watercolor": "watercolor painting style",
    "sketch": "pencil sketch, black and white",
}


async def generate(prompt: str, style: str = "realistic", size: str = "1024*1024") -> str:
    """提交图片生成任务，返回 task_id"""
    style_desc = STYLE_PROMPTS.get(style, STYLE_PROMPTS["realistic"])
    full_prompt = f"{prompt}, {style_desc}"

    logger.info(f"[IMG] 生成: '{full_prompt[:50]}' style={style}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                settings.IMAGE_SUBMIT_URL,
                json={"model": settings.IMAGE_MODEL, "input": {"prompt": full_prompt}, "parameters": {"size": size, "n": 1}},
                headers={"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}", "X-DashScope-Async": "enable", "Content-Type": "application/json"},
            )

        if response.status_code != 200:
            logger.error(f"[IMG] 提交失败: HTTP {response.status_code} {response.text[:200]}")
            raise ImageError(f"图片生成失败: HTTP {response.status_code}")

        data = response.json()
        task_id = data.get("output", {}).get("task_id", "")
        logger.info(f"[IMG] 任务已提交: {task_id}")
        return task_id

    except ImageError:
        raise
    except Exception as e:
        logger.error(f"[IMG] 异常: {type(e).__name__}: {e}")
        raise ImageError(f"图片生成异常: {e}")


async def poll(task_id: str) -> dict:
    """查询任务结果"""
    logger.debug(f"[IMG] 查询任务: {task_id}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.IMAGE_RESULT_URL}/{task_id}",
                headers={"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}"},
            )

        if response.status_code != 200:
            logger.error(f"[IMG] 查询失败: HTTP {response.status_code}")
            return {"status": "FAILED", "error": f"HTTP {response.status_code}"}

        data = response.json()
        output = data.get("output", {})
        status = output.get("task_status", "UNKNOWN")

        if status == "SUCCEEDED":
            results = output.get("results", [])
            image_url = results[0].get("url", "") if results else ""
            logger.info(f"[IMG] 生成完成: {task_id}")
            return {"status": "SUCCEEDED", "image_url": image_url}

        logger.debug(f"[IMG] 状态: {status}")
        return {"status": status}

    except Exception as e:
        logger.error(f"[IMG] 查询异常: {type(e).__name__}: {e}")
        return {"status": "FAILED", "error": str(e)}
