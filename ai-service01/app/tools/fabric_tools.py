"""
Fabric.js 工具 — 直接注入 Fabric.js JSON 到画布
AI 生成结构化 JSON，前端一行代码渲染
"""

import json
from .registry import ToolRegistry


@ToolRegistry.register(
    name="inject_fabric_json",
    description="直接注入Fabric.js JSON到画布。支持任意复杂图形、编组、文字、阴影、圆角等。这是最强大的绘图工具，能画出任何效果。",
    param_descriptions={
        "json_data": "Fabric.js JSON字符串，必须是字符串格式！格式：{\"version\":\"5.3.1\",\"objects\":[{\"type\":\"rect\",\"left\":400,\"top\":300,\"width\":100,\"height\":100,\"fill\":\"#FF0000\"}]}",
    },
)
def inject_fabric_json(json_data: str = "{}", **kwargs) -> str:
    """注入 Fabric.js JSON 到画布"""
    try:
        # 兼容 json 和 json_data 两个参数名
        raw = json_data
        if raw == "{}" and "json" in kwargs:
            raw = kwargs["json"]
        if not raw or raw == "{}":
            return '错误：json_data参数为空！必须传入JSON字符串。正确格式：json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":400,\\"top\\":300,\\"width\\":100,\\"height\\":100,\\"fill\\":\\"#FF0000\\"}]}"'

        # 验证 JSON 格式
        if isinstance(raw, str):
            data = json.loads(raw)
        else:
            data = raw

        # 确保有基本结构
        if "objects" not in data:
            # 如果传入的是单个对象，包装成数组
            if "type" in data:
                data = {"version": "5.3.1", "objects": [data]}
            else:
                return '错误：JSON缺少objects数组！正确格式：{"version":"5.3.1","objects":[{"type":"rect","left":400,"top":300,"width":100,"height":100,"fill":"#FF0000"}]}'

        return json.dumps({
            "type": "fabric_json",
            "data": data
        })

    except Exception as e:
        return f'JSON解析失败: {e}。请确保json_data是有效的JSON字符串，不是对象。正确格式：json_data="{{\\"version\\":\\"5.3.1\\",\\"objects\\":[...]}}"'


@ToolRegistry.register(
    name="create_fabric_object",
    description="创建单个Fabric.js对象。支持rect/circle/triangle/text/line/polygon。参数灵活，未识别的参数会忽略。",
    param_descriptions={
        "object_type": "对象类型: rect/circle/triangle/text/path/polygon/line",
        "left": "X坐标(px)，画布800宽",
        "top": "Y坐标(px)，画布600高",
        "fill": "填充颜色",
        "stroke": "描边颜色",
        "stroke_width": "描边宽度",
        "width": "宽度(rect)",
        "height": "高度(rect)",
        "radius": "半径(circle)",
        "text": "文字内容(text类型)",
        "font_size": "字号(text类型)",
        "shadow": "阴影: 'blur offsetX offsetY color'，如 '5 2 2 rgba(0,0,0,0.3)'",
        "rx": "圆角X(rect)",
        "ry": "圆角Y(rect)",
        "angle": "旋转角度(度)",
        "opacity": "透明度(0-1)",
        "tag": "对象标签，用于后续引用",
        "size": "大小: small/medium/large 或像素数字",
    },
    param_enums={
        "object_type": ["rect", "circle", "triangle", "text", "path", "polygon", "line"],
        "size": ["small", "medium", "large"],
    },
)
def create_fabric_object(
    object_type: str = "rect",
    left: float = 400,
    top: float = 300,
    fill: str = "#333333",
    stroke: str = "transparent",
    stroke_width: int = 2,
    width: float = 100,
    height: float = 100,
    radius: float = 50,
    text: str = "",
    font_size: int = 24,
    shadow: str = "",
    rx: int = 0,
    ry: int = 0,
    angle: float = 0,
    opacity: float = 1,
    tag: str = "",
    size: str = "",
    **kwargs,
) -> str:
    """创建单个 Fabric.js 对象"""
    # 处理 size 参数
    size_map = {"small": 40, "medium": 80, "large": 140}
    if size in size_map:
        width = size_map[size]
        height = size_map[size]
        radius = size_map[size] / 2
    elif size and size.isdigit():
        s = int(size)
        width = s
        height = s
        radius = s / 2

    obj = {
        "type": object_type,
        "left": left,
        "top": top,
        "fill": fill,
        "stroke": stroke,
        "strokeWidth": stroke_width,
        "angle": angle,
        "opacity": opacity,
        "originX": "center",
        "originY": "center",
    }

    # 添加 tag
    if tag:
        obj["tag"] = tag

    # 类型特定属性
    if object_type == "rect":
        obj["width"] = width
        obj["height"] = height
        if rx > 0: obj["rx"] = rx
        if ry > 0: obj["ry"] = ry
    elif object_type == "circle":
        obj["radius"] = radius
    elif object_type == "triangle":
        obj["width"] = width
        obj["height"] = height
    elif object_type == "text":
        obj["text"] = text
        obj["fontSize"] = font_size
        obj["fontFamily"] = "Noto Sans SC, sans-serif"
    elif object_type == "line":
        obj["x1"] = left - width / 2
        obj["y1"] = top
        obj["x2"] = left + width / 2
        obj["y2"] = top
        obj["fill"] = "transparent"
        obj["stroke"] = fill

    # 阴影
    if shadow:
        parts = shadow.split()
        if len(parts) >= 4:
            obj["shadow"] = {
                "color": parts[3],
                "blur": int(parts[0]),
                "offsetX": int(parts[1]),
                "offsetY": int(parts[2]),
            }

    return json.dumps({
        "type": "fabric_json",
        "data": {
            "version": "5.3.1",
            "objects": [obj]
        }
    })
