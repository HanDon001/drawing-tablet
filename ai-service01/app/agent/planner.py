"""
Planner — 思考器
职责：路由决策 + 工具调用规划
"""

import json
import re
import asyncio
from typing import Dict, Any, Optional, List, Tuple
from openai import AsyncOpenAI
from loguru import logger
from ..config import settings
from ..tools.registry import ToolRegistry

# ── 强硬路由拦截 ──────────────────────────────────────
FORCE_IMAGE_GEN_KEYWORDS = [
    "猫", "狗", "人", "鸟", "鱼", "龙", "动物", "人物", "肖像",
    "风景", "山水", "建筑", "车", "真实", "照片级", "3D",
    "老虎", "狮子", "大象", "兔子", "蛇", "马", "牛", "羊",
    "蝴蝶", "蜜蜂", "海豚", "鲸鱼", "企鹅", "熊猫",
    "女孩", "男孩", "男人", "女人", "宝宝", "老人",
    "山", "海", "森林", "天空",
    "汽车", "飞机", "船", "房子", "城堡", "教堂",
]

FORCE_ICON_KEYWORDS = [
    "VS Code", "vscode", "VSCode", "微信", "WeChat", "Chrome", "谷歌",
    "Apple", "苹果", "GitHub", "GitLab", "Docker", "Python",
    "React", "Vue", "Angular", "Node", "图标", "logo", "Logo",
]

TOOL_GROUPS = {
    "icon": {
        "desc": "获取知名品牌图标或通用图标的SVG代码",
        "keywords": ["图标", "logo", "VS Code", "微信", "Apple", "Chrome", "图标"],
        "tools": ["search_icon_svg"],
        "exclusive": True,
        "excludes": ["create", "vector", "vector_gen", "image_gen"],
    },
    "create": {
        "desc": "用基础几何图形(rect/ellipse/triangle/text/line)组合创建UI组件、卡片、按钮。必须用几何拼贴法！",
        "keywords": ["画", "绘制", "创建", "卡片", "按钮", "组件", "UI", "文字", "写", "矩形", "圆", "三角"],
        "tools": ["inject_fabric_json", "create_fabric_object"],
    },
    "edit": {
        "desc": "编辑已有图形：改颜色、大小、位置等",
        "keywords": ["改", "修改", "移动", "旋转", "透明", "颜色"],
        "tools": ["edit_shape", "move_shape", "resize_shape", "rotate_shape",
                  "set_opacity", "set_stroke", "fill_area", "undo", "redo"],
    },
    "delete": {
        "desc": "删除图形或清空画布",
        "keywords": ["删", "删除", "清空", "撤销", "去掉"],
        "tools": ["delete_shape", "delete_all", "undo", "redo"],
        "exclusive": True,
        "excludes": ["create", "edit", "vector", "vector_gen"],
    },
    "query": {
        "desc": "查看画布和图层信息",
        "keywords": ["看看", "有什么", "列出", "描述"],
        "tools": ["list_shapes", "describe_canvas", "get_shape_info"],
    },
    "vector": {
        "desc": "参数化矢量图形：心形、螺旋、波浪、齿轮、树、云等预置模板",
        "keywords": ["心形", "螺旋", "波浪", "云朵", "树", "花", "齿轮", "闪电"],
        "tools": ["add_vector_shape"],
        "exclusive": True,
        "excludes": ["create"],
    },
    "vector_gen": {
        "desc": "LLM生成矢量图形：用inject_fabric_json输出Fabric.js JSON。",
        "keywords": ["生成矢量", "矢量图", "插画", "图表"],
        "tools": ["inject_fabric_json"],
        "exclusive": True,
        "excludes": ["create", "vector"],
    },
    "image_gen": {
        "desc": "AI生成像素图：适合复杂艺术图形、真实动物、人物、风景。生成后以图片形式放到画布。",
        "keywords": ["猫咪", "猫", "狗", "人物", "风景", "油画", "水墨", "真实照片", "卡通画"],
        "tools": ["ai_generate_image"],
        "exclusive": True,
        "excludes": ["create", "vector_gen"],
    },
}

# ── 核心系统提示（已修复矛盾）──────────────────────────
SYSTEM_PROMPT = """你是一个名叫"小画"的语音绘图助手，基于Fabric.js矢量引擎。

【核心规则】
1. 回复极简短：一句话确认，15字以内。
2. 画任何图形必须指定fill（填充色）！默认'透明'看不见。
3. 严禁画完后调用delete_all！
4. 严禁反复画同一个东西。

【坐标系】
- 画布尺寸见上下文（如711x795像素），(0,0)=左上角，中心=(宽/2,高/2)
- 坐标用像素数字

【★★★ 绘图方式选择 ★★★】
根据你要画的东西，选择正确的绘图方式：

方式A - 几何拼贴法（用于UI组件、图标、简单图形）：
  用 rect, ellipse, circle, triangle, text, line 组合。
  ✅ 适合：按钮、卡片、对话框、简单图标、图表
  ✅ 示例：太阳 = 1个ellipse(圆) + 多个rect(光芒)

方式B - 预置矢量（用于特殊形状）：
  调用 add_vector_shape
  ✅ 适合：心形、螺旋、波浪、云朵、树、花、齿轮、闪电

方式C - 像素图（用于复杂艺术）：
  调用 ai_generate_image
  ✅ 适合：猫、狗、人物、风景、油画、真实照片

【★★★ 几何拼贴法规则 ★★★】
1. 只用 rect, ellipse, circle, triangle, text, line，不用 path！
2. 用多个简单图形堆叠出复杂效果
3. 示例-画猫：
   - 身体 = ellipse(rx:80, ry:60, fill:"#FF9F43")
   - 头 = circle(radius:50, fill:"#FF9F43")
   - 左耳 = triangle(width:30, height:30, fill:"#FF9F43", angle:-20)
   - 右耳 = triangle(width:30, height:30, fill:"#FF9F43", angle:20)
   - 左眼 = circle(radius:8, fill:"#2F3542")
   - 右眼 = circle(radius:8, fill:"#2F3542")
   - 鼻子 = ellipse(rx:5, ry:3, fill:"#FFB8B8")
   - 胡须 = line(stroke:"#2F3542", strokeWidth:1.5)

【★★★ 严禁事项 ★★★】
1. ❌ 禁止用 type:"path" 画复杂有机轮廓（猫/狗/人），必然变形！
2. ❌ 禁止用 path 的 C/Q 命令拼凑动物形状！
3. ❌ 如果要画猫/狗/人，必须用 ai_generate_image 或几何拼贴法！

【设计原则】
- shadow创造深度: {"color":"rgba(0,0,0,0.1)","blur":10,"offsetX":0,"offsetY":4}
- rect加圆角更柔和: rx:8, ry:8
- 配色和谐：使用相近色或互补色

【★★★ 独立思考配色 ★★★】
1. 看画布上已有图形的颜色风格，新图形要与之协调
2. 如果画布是暖色系（红/橙/黄），新图形也用暖色系
3. 如果画布是冷色系（蓝/紫/绿），新图形也用冷色系
4. 如果画布为空，根据用户描述的意境选择颜色：
   - 太阳/火焰/温暖 → 暖色系（#FF6B6B, #FFA502, #FFD700）
   - 月亮/星空/夜晚 → 冷色系（#4C84FF, #5F27CD, #FCD34D）
   - 草地/自然/生机 → 绿色系（#2ED573, #7BED9F）
   - 海洋/天空/平静 → 蓝色系（#4C84FF, #00D2D3, #54A0FF）
5. 不要每次都用相同的颜色！根据场景独立思考！

【★★★ 颜色细节规则 ★★★】
1. 同一物体的不同部分必须用不同颜色！不能全用一个颜色！
2. 用深浅变化创造层次感：深色做阴影/轮廓，浅色做高光/主体
3. 示例-太阳配色：
   - 外圈：深橙 #FF8C00（阴影感）
   - 内圈：亮黄 #FFD700（主体）
   - 光芒：浅黄 #FFED4E（发光感）
   - 高光点：白色 #FFFFFF（点缀）
4. 示例-猫咪配色：
   - 身体：主色 #FF9F43（橘色）
   - 肚皮：浅色 #FFD4A8（更浅的橘）
   - 耳朵内：粉色 #FFB8B8
   - 眼睛：深色 #2F3542（接近黑）
   - 眼睛高光：白色 #FFFFFF
   - 鼻子：粉色 #FF6B6B
   - 胡须：深灰 #57606F

【inject_fabric_json 用法】
参数json_data必须是Fabric.js JSON字符串。
格式: json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[...]}"

【示例：蓝色圆角按钮】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":160,\\"height\\":50,\\"fill\\":\\"#4C84FF\\",\\"rx\\":8,\\"ry\\":8,\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.15)\\",\\"blur\\":12,\\"offsetX\\":0,\\"offsetY\\":4}},{\\"type\\":\\"text\\",\\"text\\":\\"点击我\\",\\"left\\":355,\\"top\\":397,\\"fontSize\\":18,\\"fill\\":\\"#FFFFFF\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\"}]}"

【示例：用几何拼贴法画太阳（丰富色彩）】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":0,\\"rx\\":3},{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":45,\\"rx\\":3},{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":90,\\"rx\\":3},{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":135,\\"rx\\":3},{\\"type\\":\\"circle\\",\\"left\\":355,\\"top\\":397,\\"radius\\":52,\\"fill\\":\\"#FF8C00\\",\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.2)\\",\\"blur\\":15,\\"offsetX\\":0,\\"offsetY\\":5}},{\\"type\\":\\"circle\\",\\"left\\":355,\\"top\\":397,\\"radius\\":42,\\"fill\\":\\"#FFA502\\"},{\\"type\\":\\"circle\\",\\"left\\":355,\\"top\\":397,\\"radius\\":30,\\"fill\\":\\"#FFD700\\"},{\\"type\\":\\"circle\\",\\"left\\":345,\\"top\\":387,\\"radius\\":8,\\"fill\\":\\"#FFFFFF\\",\\"opacity\\":0.6}]}"

【示例：用几何拼贴法画猫（丰富色彩）】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"ellipse\\",\\"left\\":400,\\"top\\":420,\\"rx\\":80,\\"ry\\":55,\\"fill\\":\\"#FF9F43\\",\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.1)\\",\\"blur\\":8}},{\\"type\\":\\"ellipse\\",\\"left\\":400,\\"top\\":430,\\"rx\\":50,\\"ry\\":35,\\"fill\\":\\"#FFD4A8\\"},{\\"type\\":\\"circle\\",\\"left\\":400,\\"top\\":340,\\"radius\\":50,\\"fill\\":\\"#FF9F43\\",\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.08)\\",\\"blur\\":6}},{\\"type\\":\\"circle\\",\\"left\\":400,\\"top\\":350,\\"radius\\":35,\\"fill\\":\\"#FFD4A8\\"},{\\"type\\":\\"triangle\\",\\"left\\":358,\\"top\\":295,\\"width\\":30,\\"height\\":30,\\"fill\\":\\"#FF9F43\\",\\"angle\\":-15},{\\"type\\":\\"triangle\\",\\"left\\":362,\\"top\\":298,\\"width\\":20,\\"height\\":20,\\"fill\\":\\"#FFB8B8\\",\\"angle\\":-15},{\\"type\\":\\"triangle\\",\\"left\\":442,\\"top\\":295,\\"width\\":30,\\"height\\":30,\\"fill\\":\\"#FF9F43\\",\\"angle\\":15},{\\"type\\":\\"triangle\\",\\"left\\":438,\\"top\\":298,\\"width\\":20,\\"height\\":20,\\"fill\\":\\"#FFB8B8\\",\\"angle\\":15},{\\"type\\":\\"circle\\",\\"left\\":383,\\"top\\":330,\\"radius\\":8,\\"fill\\":\\"#2F3542\\"},{\\"type\\":\\"circle\\",\\"left\\":385,\\"top\\":328,\\"radius\\":3,\\"fill\\":\\"#FFFFFF\\"},{\\"type\\":\\"circle\\",\\"left\\":417,\\"top\\":330,\\"radius\\":8,\\"fill\\":\\"#2F3542\\"},{\\"type\\":\\"circle\\",\\"left\\":419,\\"top\\":328,\\"radius\\":3,\\"fill\\":\\"#FFFFFF\\"},{\\"type\\":\\"ellipse\\",\\"left\\":400,\\"top\\":348,\\"rx\\":5,\\"ry\\":3,\\"fill\\":\\"#FF6B6B\\"},{\\"type\\":\\"line\\",\\"left\\":380,\\"top\\":352,\\"width\\":15,\\"height\\":0,\\"stroke\\":\\"#57606F\\",\\"strokeWidth\\":1.5},{\\"type\\":\\"line\\",\\"left\\":420,\\"top\\":352,\\"width\\":15,\\"height\\":0,\\"stroke\\":\\"#57606F\\",\\"strokeWidth\\":1.5}]}"

【路由策略】
- 知名Logo/图标 → search_icon_svg
- UI组件/几何/拼贴 → inject_fabric_json (只用rect/ellipse/triangle/text/line)
- 预置矢量(心/云/树/花) → add_vector_shape
- 复杂艺术(猫/狗/人/风景) → ai_generate_image"""


class Planner:

    def __init__(self):
        self._client: Optional[AsyncOpenAI] = None
        self._all_tools: Optional[dict] = None

    def get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=settings.DEEPSEEK_API_KEY,
                base_url=settings.DEEPSEEK_BASE_URL,
            )
            logger.info(f"[Planner] LLM: {settings.LLM_MODEL}")
        return self._client

    def get_all_tools(self) -> dict:
        if self._all_tools is None:
            self._all_tools = {t["function"]["name"]: t for t in ToolRegistry.get_openai_tools()}
            logger.info(f"[Planner] 已注册 {len(self._all_tools)} 个工具")
        return self._all_tools

    def build_messages(self, user_text: str, canvas_context: str = "") -> list:
        system = SYSTEM_PROMPT
        if canvas_context:
            system += f"\n\n【画布状态】\n{canvas_context}"
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ]

    async def route(self, user_text: str) -> List[str]:
        """路由决策：判断用户意图需要哪类工具"""

        # ── 第0层：强硬拦截 - 知名图标 ──
        if any(kw in user_text for kw in FORCE_ICON_KEYWORDS):
            all_tools = self.get_all_tools()
            if "search_icon_svg" in all_tools:
                logger.info(f"[Router] 强制图标: 检测到Logo/图标关键词")
                return ["icon"]

        # ── 第1层：强硬拦截 - 复杂有机体 → 图片生成 ──
        if any(kw in user_text for kw in FORCE_IMAGE_GEN_KEYWORDS):
            all_tools = self.get_all_tools()
            if "ai_generate_image" in all_tools:
                logger.info(f"[Router] 强制图片: 检测到生物/复杂物体关键词")
                return ["image_gen"]
            # 没有图片生成能力，降级到 vector_gen (LLM尝试几何拼贴)
            logger.info(f"[Router] 降级矢量: 无图片生成工具，尝试几何拼贴")
            return ["create"]

        # ── 第2层：关键词匹配 ──
        matched = set()
        for group_name, group in TOOL_GROUPS.items():
            for kw in group["keywords"]:
                if kw in user_text:
                    matched.add(group_name)
                    break

        # exclusive 组优先
        exclusive_matched = sorted(
            [g for g in matched if TOOL_GROUPS.get(g, {}).get("exclusive")],
            key=lambda g: len(TOOL_GROUPS[g].get("excludes", [])),
            reverse=True
        )
        if exclusive_matched:
            keep, remove = set(), set()
            for g in exclusive_matched:
                if g in remove:
                    continue
                keep.add(g)
                remove.update(TOOL_GROUPS[g].get("excludes", []))
            matched = (matched - remove) | keep
            logger.info(f"[Router] exclusive 优先: {keep}, 移除 {remove}")

        if matched:
            logger.info(f"[Router] 关键词匹配: {matched}")
            return list(matched)

        # ── 第3层：小模型路由 ──
        client = self.get_client()
        group_desc = "\n".join(f"- {k}: {v['desc']}" for k, v in TOOL_GROUPS.items())
        router_prompt = f"""你是工具路由器。根据用户指令判断需要哪些工具组。
只返回JSON数组，如 ["create","edit"]。

工具组:
{group_desc}

用户指令: {user_text}"""
        try:
            resp = await asyncio.wait_for(
                client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[{"role": "user", "content": router_prompt}],
                    max_tokens=50,
                ),
                timeout=10,
            )
            text = resp.choices[0].message.content or "[]"
            match = re.search(r'\[.*?\]', text)
            if match:
                groups = json.loads(match.group())
                valid = [g for g in groups if g in TOOL_GROUPS]
                if valid:
                    logger.info(f"[Router] LLM路由: {valid}")
                    return valid
        except Exception as e:
            logger.warning(f"[Router] LLM路由失败: {e}")

        logger.info(f"[Router] 兜底: create")
        return ["create"]

    async def think(self, messages: list, tool_groups: List[str] = None) -> Tuple[Any, List[Dict], float]:
        """调用 LLM 思考，解析工具调用决策"""
        client = self.get_client()
        all_tools = self.get_all_tools()

        if tool_groups:
            allowed_names = set()
            for g in tool_groups:
                if g in TOOL_GROUPS:
                    allowed_names.update(TOOL_GROUPS[g]["tools"])
            allowed_names.update({"undo", "redo", "delete_object", "delete_all"})
            tools = [all_tools[n] for n in allowed_names if n in all_tools]
        else:
            tools = list(all_tools.values())

        logger.info(f"[Think] 使用 {len(tools)} 个工具 (from {tool_groups})")

        t0 = asyncio.get_event_loop().time()
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                max_tokens=4000,
            ),
            timeout=settings.LLM_TIMEOUT,
        )
        elapsed = asyncio.get_event_loop().time() - t0

        msg = resp.choices[0].message
        tool_calls = self._parse_tool_calls(msg)

        logger.debug(f"[Think] LLM response content: {msg.content[:200] if msg.content else 'None'}")
        logger.debug(f"[Think] LLM tool_calls: {msg.tool_calls}")
        logger.debug(f"[Think] Parsed tool_calls: {tool_calls}")

        return msg, tool_calls, elapsed

    def _parse_tool_calls(self, msg) -> List[Dict]:
        calls = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception as e:
                    logger.warning(f"[Planner] 解析 tool_call 参数失败: {e}")
                    logger.warning(f"[Planner] 原始 arguments: {tc.function.arguments[:200]}")
                    args = {}
                calls.append({"id": tc.id, "name": tc.function.name, "args": args})
        return calls

    def extract_reply(self, msg) -> str:
        return (msg.content or "收到指令").strip()


planner = Planner()
