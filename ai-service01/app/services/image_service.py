"""
图片生成服务 — DashScope 文生图
日志前缀: [IMG]
"""

import asyncio
from loguru import logger
from ..config import settings
from ..exceptions import ImageError

import dashscope
from dashscope import ImageSynthesis

dashscope.api_key = settings.DASHSCOPE_API_KEY

STYLE_PROMPTS = {
    "realistic": "photorealistic, highly detailed, 8k resolution",
    "cartoon": "cartoon style, colorful, cute illustration",
    "watercolor": "watercolor painting style, soft colors",
    "sketch": "pencil sketch, black and white, detailed lines",
}


async def generate(prompt: str, style: str = "realistic", size: str = "1024*1024") -> str:
    """提交图片生成任务，返回 task_id"""
    style_desc = STYLE_PROMPTS.get(style, STYLE_PROMPTS["realistic"])
    full_prompt = f"{prompt}, {style_desc}"

    logger.info(f"[IMG] 生成: '{full_prompt[:50]}' style={style}")

    try:
        # 使用 DashScope SDK 调用文生图
        response = await asyncio.to_thread(
            _call_image_synthesis,
            full_prompt,
            size
        )

        if response.status_code != 200:
            logger.error(f"[IMG] 提交失败: {response.code} {response.message}")
            raise ImageError(f"图片生成失败: {response.message}")

        # 获取结果（同步模式直接返回）
        results = response.output.results
        if results and len(results) > 0:
            image_url = results[0].url
            logger.info(f"[IMG] 生成成功: {image_url[:80]}")
            return image_url
        else:
            raise ImageError("图片生成失败: 无结果")

    except ImageError:
        raise
    except Exception as e:
        logger.error(f"[IMG] 异常: {type(e).__name__}: {e}")
        raise ImageError(f"图片生成异常: {e}")


def _call_image_synthesis(prompt: str, size: str):
    """同步调用 DashScope 文生图"""
    return ImageSynthesis.call(
        model="wanx2.1-t2i-turbo",
        prompt=prompt,
        n=1,
        size=size,
    )
