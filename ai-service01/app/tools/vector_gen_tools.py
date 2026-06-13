"""
矢量图生成工具 — 文生图 + 自动矢量化
"""

import asyncio
from loguru import logger
from .registry import ToolRegistry
from ..services import image_service
from ..services.vectorize_service import vectorize_image


@ToolRegistry.register(
    name="generate_vector_art",
    description="用AI生成图片并自动转为矢量路径。适合生成复杂插画、Logo、图标等。先调用文生图模型生成图片，再自动提取矢量路径绘制到画布。",
    param_descriptions={
        "prompt": "描述要生成的图像内容，如'一只可爱的猫咪'",
        "style": "风格: realistic(写实)/cartoon(卡通)/watercolor(水彩)/sketch(素描)",
        "detail_level": "细节等级: low(少路径快)/medium(平衡)/high(精细慢)",
    },
    param_enums={
        "style": ["realistic", "cartoon", "watercolor", "sketch"],
        "detail_level": ["low", "medium", "high"],
    },
)
async def generate_vector_art(prompt: str, style: str = "cartoon",
                               detail_level: str = "medium") -> str:
    """生成图片并转为 SVG 矢量路径"""
    # 细节等级 → 参数映射
    detail_map = {
        "low": {"max_paths": 15, "min_area": 200},
        "medium": {"max_paths": 30, "min_area": 100},
        "high": {"max_paths": 50, "min_area": 50},
    }
    params = detail_map.get(detail_level, detail_map["medium"])

    logger.info(f"[VecGen] 生成矢量图: '{prompt}' style={style} detail={detail_level}")

    try:
        # 1. 提交图片生成任务
        task_id = await image_service.generate(prompt, style=style, size="1024*1024")
        logger.info(f"[VecGen] 任务已提交: {task_id}")

        # 2. 轮询等待生成完成
        image_url = ""
        for _ in range(60):  # 最多等 120 秒
            await asyncio.sleep(2)
            result = await image_service.poll(task_id)
            if result["status"] == "SUCCEEDED":
                image_url = result.get("image_url", "")
                break
            elif result["status"] == "FAILED":
                logger.error(f"[VecGen] 生成失败: {result.get('error')}")
                return f"图片生成失败: {result.get('error', '未知错误')}"

        if not image_url:
            return "图片生成超时，请重试"

        # 3. 矢量化
        paths = await vectorize_image(image_url, max_paths=params["max_paths"])

        if not paths:
            return "矢量化失败，未提取到有效路径"

        # 4. 返回结果（前端会解析 paths 并渲染）
        import json
        return f"已生成矢量图，共{len(paths)}条路径。" + json.dumps({
            "type": "vector_art",
            "paths": paths,
            "prompt": prompt,
            "source_url": image_url,
        })

    except Exception as e:
        logger.error(f"[VecGen] 异常: {type(e).__name__}: {e}")
        return f"矢量图生成失败: {e}"
