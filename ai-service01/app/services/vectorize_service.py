"""
矢量化服务 — 位图转 SVG 路径
日志前缀: [VEC]

流程: 下载图片 → 灰度 → 二值化 → 轮廓提取 → SVG path
支持 OpenCV（优先）或纯 Pillow+numpy 降级方案
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
    logger.info("[VEC] OpenCV 可用，使用 cv2 轮廓提取")
except ImportError:
    HAS_CV2 = False
    logger.info("[VEC] OpenCV 不可用，使用 Pillow+numpy 降级方案")


# ── OpenCV 方案 ──────────────────────────────────────────

def _cv2_contour_to_svg_path(contour: np.ndarray, epsilon: float = 2.0) -> str:
    """将 OpenCV 轮廓转换为 SVG path d 属性"""
    approx = cv2.approxPolyDP(contour, epsilon, closed=True)
    if len(approx) < 3:
        return ""
    points = approx.reshape(-1, 2)
    parts = [f"M {points[0][0]} {points[0][1]}"]
    for pt in points[1:]:
        parts.append(f"L {pt[0]} {pt[1]}")
    parts.append("Z")
    return " ".join(parts)


def _cv2_image_to_svg_paths(img: Image.Image, max_paths: int = 30, min_area: int = 100) -> list[str]:
    """OpenCV 轮廓提取"""
    gray = np.array(img.convert("L"))
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    contours = [c for c in contours if cv2.contourArea(c) >= min_area][:max_paths]
    logger.info(f"[VEC] OpenCV 提取 {len(contours)} 条轮廓")
    paths = []
    for contour in contours:
        path_d = _cv2_contour_to_svg_path(contour, epsilon=2.0)
        if path_d:
            paths.append(path_d)
    return paths


# ── Pillow+numpy 降级方案 ──────────────────────────────────

def _pil_find_contours(binary: np.ndarray, min_length: int = 20) -> list:
    """纯 numpy 轮廓追踪（Suzuki 算法简化版）"""
    h, w = binary.shape
    visited = np.zeros_like(binary, dtype=bool)
    contours = []

    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if binary[y, x] > 0 and not visited[y, x]:
                # 追踪轮廓
                contour = []
                cy, cx = y, x
                dir = 0  # 0=右, 1=下, 2=左, 3=上

                for _ in range(10000):  # 防止无限循环
                    if visited[cy, cx]:
                        break
                    visited[cy, cx] = True
                    contour.append((cx, cy))

                    # 找下一个轮廓点
                    found = False
                    for d in range(4):
                        nd = (dir + d) % 4
                        ny, nx = cy, cx
                        if nd == 0: nx += 1
                        elif nd == 1: ny += 1
                        elif nd == 2: nx -= 1
                        else: ny -= 1

                        if 0 <= nx < w and 0 <= ny < h and binary[ny, nx] > 0:
                            cy, cx = ny, nx
                            dir = (nd + 2) % 4  # 反向
                            found = True
                            break

                    if not found or (cx == x and cy == y):
                        break

                if len(contour) >= min_length:
                    contours.append(contour)

    return contours


def _contour_to_svg(contour: list, simplify: int = 3) -> str:
    """将轮廓点列表转换为 SVG path，可选简化"""
    if len(contour) < 3:
        return ""

    # 简化：每隔 simplify 个点取一个
    if simplify > 1:
        simplified = [contour[i] for i in range(0, len(contour), simplify)]
        if simplified[0] != contour[-1]:
            simplified.append(contour[-1])
    else:
        simplified = contour

    if len(simplified) < 3:
        return ""

    parts = [f"M {simplified[0][0]} {simplified[0][1]}"]
    for pt in simplified[1:]:
        parts.append(f"L {pt[0]} {pt[1]}")
    parts.append("Z")
    return " ".join(parts)


def _pil_image_to_svg_paths(img: Image.Image, max_paths: int = 30, min_length: int = 20) -> list[str]:
    """Pillow+numpy 轮廓提取（降级方案）"""
    # 转灰度 + 二值化
    gray = np.array(img.convert("L"))
    # 自适应阈值（简化版：全局阈值 + 边缘检测）
    threshold = int(np.mean(gray) * 0.8)
    binary = np.where(gray < threshold, 255, 0).astype(np.uint8)

    # 形态学闭操作（简化版：膨胀+腐蚀）
    try:
        from scipy.ndimage import binary_closing, binary_opening
        struct = np.ones((3, 3))
        binary = binary_closing(binary, structure=struct).astype(np.uint8) * 255
        binary = binary_opening(binary, structure=struct).astype(np.uint8) * 255
    except ImportError:
        # 没有 scipy，用简单膨胀
        pass

    # 轮廓追踪
    contours = _pil_find_contours(binary, min_length)
    contours.sort(key=lambda c: len(c), reverse=True)
    contours = contours[:max_paths]

    logger.info(f"[VEC] Pillow 提取 {len(contours)} 条轮廓")

    paths = []
    for contour in contours:
        path_d = _contour_to_svg(contour, simplify=3)
        if path_d:
            paths.append(path_d)

    return paths


# ── 统一接口 ──────────────────────────────────────────

def _image_to_svg_paths(img: Image.Image, max_paths: int = 30, min_area: int = 100) -> list[str]:
    """将 PIL Image 转换为 SVG path 列表"""
    if HAS_CV2:
        return _cv2_image_to_svg_paths(img, max_paths=max_paths, min_area=min_area)
    else:
        return _pil_image_to_svg_paths(img, max_paths=max_paths, min_length=min_area)


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

        # 缩放到合理尺寸
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
