"""
图标检索工具 — 从 Iconify API 获取标准 SVG 图标
"""

import requests
from .registry import ToolRegistry


@ToolRegistry.register(
    name="search_icon_svg",
    description="获取知名品牌图标或通用图标的SVG代码，如VS Code, Apple, 设置图标等。返回Fabric.js可直接渲染的SVG数据。",
    param_descriptions={
        "query": "图标名称或品牌名，如 'VS Code', 'Apple', '设置', '首页', '微信'",
    },
)
def search_icon_svg(query: str = "", **kwargs) -> str:
    """从 Iconify 获取标准 SVG"""
    if not query:
        return '错误：query参数不能为空！请提供图标名称，如 "VS Code" 或 "设置"。'

    try:
        # 搜索图标
        search_url = f"https://api.iconify.design/search?query={query}&limit=3"
        res = requests.get(search_url, timeout=10)
        res.raise_for_status()
        data = res.json()

        icons = data.get("icons", [])
        if not icons:
            return f'未找到"{query}"相关的图标，请尝试其他关键词。'

        # 取第一个结果
        icon_name = icons[0]  # 如 "logos:visual-studio-code"

        # 获取 SVG 代码
        svg_url = f"https://api.iconify.design/{icon_name}.svg"
        svg_res = requests.get(svg_url, timeout=10)
        svg_res.raise_for_status()
        svg_content = svg_res.text

        # 返回 Fabric.js 可用的格式
        import json
        return json.dumps({
            "type": "fabric_svg",
            "svg_string": svg_content,
            "icon_name": icon_name,
            "message": f"已获取标准 {query} 图标"
        })

    except requests.exceptions.Timeout:
        return f'获取"{query}"图标超时，请稍后重试。'
    except requests.exceptions.RequestException as e:
        return f'获取"{query}"图标失败: {str(e)}'
    except Exception as e:
        return f'处理"{query}"图标时出错: {str(e)}'
