"""
矢量化服务 — 位图转 SVG 路径
日志前缀: [VEC]

流程: 下载图片 → 灰度 → 二值化 → OpenCV 轮廓提取 → SVG path
"""

import io
import math
import httpx
import numpy as np
from PIL import Image
from loguru import logger

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    logger.warning("[VEC] opencv-python-headless 未安装，矢量化不可用")


def _contour_to_svg_path(contour: np.ndarray, epsilon: float = 2.0) -> str:
    """将 OpenCV 轮廓转换为 SVG path d 属性"""
    # 简化轮廓减少点数
    approx = cv2.approxPolyDP(contour, epsilon, closed=True)

    if len(approx) < 3:
        return ""

    points = approx.reshape(-1, 2)
    parts = []

    # M: 移动到起点
    parts.append(f"M {points[0][0]} {points[0][1]}")

    # L: 直线连接各点
    for pt in points[1:]:
        parts.append(f"L {pt[0]} {pt[1]}")

    # Z: 闭合
    parts.append("Z")

    return " ".join(parts)


def _image_to_svg_paths(img: Image.Image, max_paths: int = 30, min_area: int = 100) -> list[str]:
    """将 PIL Image 转换为 SVG path 列表"""
    if not HAS_CV2:
        logger.warning("[VEC] OpenCV 不可用，返回空列表")
        return []

    # 转灰度
    gray = np.array(img.convert("L"))

    # 自适应二值化（比固定阈值效果好）
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 11, 2
    )

    # 形态学操作：去噪 + 连接断线
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    # 查找轮廓
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    # 按面积排序，取最大的 N 个
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    contours = [c for c in contours if cv2.contourArea(c) >= min_area][:max_paths]

    logger.info(f"[VEC] 提取 {len(contours)} 条轮廓 (最小面积={min_area})")

    # 转 SVG path
    paths = []
    for contour in contours:
        path_d = _contour_to_svg_path(contour, epsilon=2.0)
        if path_d:
            paths.append(path_d)

    return paths


async def vectorize_image(image_url: str, max_paths: int = 30) -> list[str]:
    """
    下载图片并转换为 SVG path 列表

    Args:
        image_url: 图片 URL
        max_paths: 最大路径数

    Returns:
        SVG path d 属性字符串列表
    """
    logger.info(f"[VEC] 矢量化: {image_url[:80]}")

    try:
        # 下载图片
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            if resp.status_code != 200:
                logger.error(f"[VEC] 下载失败: HTTP {resp.status_code}")
                return []

        # 打开图片
        img = Image.open(io.BytesIO(resp.content))

        # 缩放到合理尺寸（太大太慢，太小丢失细节）
        max_dim = 512
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            logger.info(f"[VEC] 缩放到 {new_size}")

        # 转 SVG paths
        paths = _image_to_svg_paths(img, max_paths=max_paths)

        logger.info(f"[VEC] 完成: {len(paths)} 条路径")
        return paths

    except Exception as e:
        logger.error(f"[VEC] 矢量化异常: {type(e).__name__}: {e}")
        return []
