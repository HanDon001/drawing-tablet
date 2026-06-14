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
        "desc": "编辑已有图形：移动位置、改颜色、大小、透明度、图层顺序、保存、编组等",
        "keywords": ["改", "修改", "移动", "挪", "偏", "旋转", "透明", "颜色", "变大", "变小", "移到", "放到",
                     "置顶", "置底", "上移", "下移", "前面", "后面", "层级", "图层",
                     "保存", "导出", "编组", "组合", "解组", "解散",
                     "变为", "变成", "变色", "换成", "改成", "改为", "染", "涂", "更换"],
        "tools": ["edit_shape", "move_shape", "resize_shape", "rotate_shape",
                  "set_opacity", "set_stroke", "fill_area", "reorder_layer",
                  "save_as_png", "save_as_svg", "group_objects", "group_by_tag", "ungroup_objects",
                  "undo", "redo"],
    },
    "delete": {
        "desc": "删除图形或清空画布",
        "keywords": ["删", "删除", "清空", "撤销", "去掉"],
        "tools": ["delete_shape", "delete_by_tag", "delete_all", "undo", "redo"],
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
        "desc": "AI生成像素图：适合复杂艺术图形、真实动物、人物、风景、复杂场景。生成后以图片形式放到画布。",
        "keywords": ["猫咪", "猫", "狗", "人物", "风景", "油画", "水墨", "真实照片", "卡通画",
                     "图片生成", "生成图片", "AI生成", "AI画", "生成一个", "画一个真实的",
                     "用AI", "用图片", "复杂", "写实", "3D", "渲染", "照片级"],
        "tools": ["ai_generate_image"],
        "exclusive": True,
        "excludes": ["create", "vector_gen"],
    },
}

# ── 核心系统提示 ──────────────────────────
SYSTEM_PROMPT = """你是「小画」，一个简洁高效的 AI 绘画助手。

【回复规则：极简】
- 每次回复最多1句话，10-15个字
- 不要用emoji，不要主动提建议
- 用户没问就不要多说
- ✅ "画好了" "删掉了" "已移动" "好的"
- ❌ "哇，星空出来啦！🌙✨ 画布上是深邃的蓝紫色夜空..."（太长）
- 用户问"帮我看看画布"时才详细描述

【无障碍设计】
- 用户可能是视障人士，依赖语音反馈
- 操作后用一句话描述结果即可

【核心规则】
1. 【★ 回复极简 ★】最多1-2句话，15个字以内！不要用emoji！不要主动提建议！用户没问就不要说！
   - ✅ "画好了" "删掉了" "已移动"
   - ❌ "哇，星空出来啦！🌙✨ 画布上是深邃的蓝紫色夜空..."（太长）
2. 画任何图形必须指定fill（填充色）！默认'透明'看不见
3. 严禁画完后调用delete_all！
4. 【必须调用工具】执行任何操作都必须调用对应工具，不能只回复文字！
5. 【★★★ 每个对象必须设置 tag ★★★】没有 tag 就无法编辑和删除！
   - 每个对象都必须有 tag 属性，如 "tag":"月亮"
   - 不设 tag = 无法被后续操作找到！
6. 【图形查找规则】
   - 用户说"那个"、"它"、"刚才的"→ 不需要target_tag，自动选中最后创建的图形
   - 用户说"树" → target_tag="树"（会模糊匹配"树干"、"树冠"）
   - 用户说"红色的圆" → target_tag="红"（按颜色匹配）
   - 用户说"圆形" → target_tag="圆"（按形状匹配）

【连续指令处理】
1. 用户可能连续说多个指令，按顺序执行
2. 用户说"它"、"那个"、"刚才的"时，根据上下文推断
3. 用户说"画一个太阳，然后移到左边" → 先画太阳，再移动

【坐标系】
- (0,0)=左上角，单位=像素
- left/top = 图形左上角（默认 originX:left, originY:top）
- ★ 圆形也用左上角：left = 圆心X - radius, top = 圆心Y - radius
- ★ 不要设置 originX/originY，所有图形统一用左上角
- 画布尺寸见上下文（如1191x790），中心=(595,395)
- 坐标用像素数字，直接写数值

【★★★ 绘图方式选择 ★★★】
根据你要画的东西，选择正确的绘图方式：

方式A - 几何拼贴法（用于UI组件、图标、简单图形）：
  用 rect, ellipse, circle, triangle, text, line 组合。
  ✅ 适合：按钮、卡片、对话框、简单图标、图表
  ✅ 示例：太阳 = 1个ellipse(圆) + 多个rect(光芒)

方式B - 预置矢量（用于特殊形状）：
  调用 add_vector_shape
  ✅ 适合：心形、螺旋、波浪、云朵、树、花、齿轮、闪电

方式C - AI生图（用于复杂艺术）：
  调用 ai_generate_image(prompt="描述", style="realistic")
  ✅ 适合：猫、狗、人物、风景、油画、真实照片、复杂场景
  ✅ 用户说以下关键词时必须使用此方式：
     - "用AI生成"、"用图片生成"、"AI画"
     - "复杂的"、"写实的"、"3D"、"渲染"、"照片级"
     - "猫"、"狗"、"动物"、"人物"、"风景"等复杂对象
  ✅ style 可选: realistic(写实), cartoon(卡通), watercolor(水彩), sketch(素描)

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

【★★★ 透明度规则 ★★★】
1. opacity 范围 0-1：0=完全透明，1=完全不透明
2. 用透明度创造层次感和深度：
   - 背景/光晕：opacity 0.1-0.3
   - 半透明效果：opacity 0.4-0.6
   - 前景主体：opacity 0.8-1.0
3. 示例-月亮光晕：外圈 opacity:0.1，中圈 opacity:0.2，内圈 opacity:0.8
4. 示例-玻璃效果：fill:"#FFFFFF", opacity:0.3

【★★★ 层级结构规则 ★★★】
1. 画布上的图形有层级关系：后创建的在上层，先创建的在下层
2. 用图层面板可以调整层级顺序（上移/下移/置顶/置底）
3. 编组（Ctrl+G）可以将多个图形组合成一个整体
4. 编组内的图形也有自己的层级，可以在组内调整
5. 用户说"把太阳放到最上面"→ 需要置顶操作
6. 用户说"把月亮放到云朵后面"→ 需要下移操作

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
参数json_data必须是Fabric.js JSON字符串，坐标用像素。
格式: json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[...]}"
⚠️ 每个对象必须加 tag 属性！如 "tag":"月亮"，否则无法编辑/删除！

【示例：蓝色圆角按钮】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":370,\\"width\\":160,\\"height\\":50,\\"fill\\":\\"#4C84FF\\",\\"rx\\":8,\\"ry\\":8,\\"tag\\":\\"按钮\\"},{\\"type\\":\\"text\\",\\"text\\":\\"点击我\\",\\"left\\":435,\\"top\\":395,\\"fontSize\\":18,\\"fill\\":\\"#FFFFFF\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"tag\\":\\"按钮\\"}]}"

【示例：用几何拼贴法画太阳（每个对象都有tag）】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":349,\\"top\\":347,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"angle\\":0,\\"tag\\":\\"太阳\\"},{\\"type\\":\\"rect\\",\\"left\\":349,\\"top\\":347,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"angle\\":45,\\"tag\\":\\"太阳\\"},{\\"type\\":\\"rect\\",\\"left\\":349,\\"top\\":347,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"angle\\":90,\\"tag\\":\\"太阳\\"},{\\"type\\":\\"rect\\",\\"left\\":349,\\"top\\":347,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"angle\\":135,\\"tag\\":\\"太阳\\"},{\\"type\\":\\"circle\\",\\"left\\":303,\\"top\\":345,\\"radius\\":52,\\"fill\\":\\"#FF8C00\\",\\"tag\\":\\"太阳\\"},{\\"type\\":\\"circle\\",\\"left\\":313,\\"top\\":355,\\"radius\\":42,\\"fill\\":\\"#FFA502\\",\\"tag\\":\\"太阳\\"},{\\"type\\":\\"circle\\",\\"left\\":325,\\"top\\":367,\\"radius\\":30,\\"fill\\":\\"#FFD700\\",\\"tag\\":\\"太阳\\"}]}"

【★★★ 编辑已有图形 ★★★】
用户说"移动一下"、"挪个位置"、"往左移"、"移到下方"、"移到上方"时，使用 move_shape 工具（改位置坐标）：
- move_shape(target_tag="海洋", x=0.3, y=0.5) → 移动到指定坐标
- move_shape(target_tag="太阳", position="left_top") → 移动到左上角
- move_shape(target_tag="海洋", position="bottom") → 移动到画布下方

用户说"改个颜色"、"变大一点"时，使用 edit_shape 工具：
- edit_shape(target_tag="圆", new_color="红") → 改颜色
- edit_shape(target_tag="圆", new_size="large") → 改大小

用户说"删掉"、"去掉"时，使用 delete_by_tag 工具（按标签批量删除）：
- delete_by_tag(target_tag="太阳") → 删除所有标签包含"太阳"的图形
- delete_by_tag(target_tag="海洋") → 删除所有标签包含"海洋"的图形

注意：太阳、海洋等复杂图形由多个基础形状组成，需要用 delete_by_tag 批量删除

【★★★ 图层顺序调整（仅z轴叠放顺序，不是位置移动）★★★】
用户说"放到最上面"、"置顶"、"移到前面"、"移到上层"时，使用 reorder_layer（仅改叠放顺序）：
⚠️ "移动到...下方/上方/左边/右边" 是位置移动，用 move_shape！不是 reorder_layer！
- reorder_layer(target_tag="海洋", direction="front") → 置顶
- reorder_layer(target_tag="海洋", direction="back") → 置底
- reorder_layer(target_tag="海洋", direction="forward") → 上移一层
- reorder_layer(target_tag="海洋", direction="backward") → 下移一层

direction 值：
- front = 置顶（最前面，遮挡其他图形）
- back = 置底（最后面，被其他图形遮挡）
- forward = 上移一层
- backward = 下移一层

【★★★ 保存与编组 ★★★】
用户说"保存"、"导出图片"时：
- save_as_png() → 保存为PNG图片

用户说"保存矢量"、"导出SVG"时：
- save_as_svg() → 保存为SVG矢量图

用户说"编组"、"组合"、"把XX编组"时：
- group_by_tag(target_tag="太阳") → 将所有标签包含"太阳"的图形编组
- group_objects() → 将当前选中的图形编组

用户说"解组"、"解散"时：
- ungroup_objects(target_tag="编组1") → 解散编组

【路由策略】
- 知名Logo/图标 → search_icon_svg
- UI组件/几何/拼贴 → inject_fabric_json (只用rect/ellipse/triangle/text/line)
- 预置矢量(心/云/树/花) → add_vector_shape
- 复杂艺术(猫/狗/人/风景) → ai_generate_image
- 移动/编辑/删除已有图形 → move_shape / edit_shape / delete_by_tag
- 图层调整 → reorder_layer
- 保存/导出 → save_as_png / save_as_svg
- 编组/解组 → group_objects / ungroup_objects"""


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
        # 但如果用户有明确的编辑/删除意图，不拦截
        _edit_delete_words = ["删除", "删掉", "去掉", "移除", "改", "修改", "移动", "编辑",
                              "变为", "变成", "改成", "换成", "移到", "旋转", "透明",
                              "变色", "颜色", "变大", "变小"]
        if any(kw in user_text for kw in FORCE_IMAGE_GEN_KEYWORDS):
            if not any(w in user_text for w in _edit_delete_words):
                all_tools = self.get_all_tools()
                if "ai_generate_image" in all_tools:
                    logger.info(f"[Router] 强制图片: 检测到生物/复杂物体关键词")
                    return ["image_gen"]
                logger.info(f"[Router] 降级矢量: 无图片生成工具，尝试几何拼贴")
                return ["create"]
            else:
                logger.info(f"[Router] 跳过图片拦截: 检测到编辑/删除意图")

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

        # ── edit 优先于 create：当两者同时匹配时，检查编辑意图 ──
        if "create" in matched and "edit" in matched:
            edit_intent_words = ["变为", "变成", "变色", "换成", "改成", "改为",
                                 "改", "移动", "移到", "旋转", "删除", "去掉",
                                 "挪", "偏", "染", "涂", "更换"]
            if any(w in user_text for w in edit_intent_words):
                matched.discard("create")
                logger.info(f"[Router] 编辑意图优先, 移除 create → {matched}")

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
            # 安全网：所有路由都注入基础编辑/移动/删除工具
            allowed_names.update({"edit_shape", "fill_area", "move_shape", "resize_shape",
                                  "delete_by_tag", "delete_shape"})
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

        # 诊断日志：空响应时记录 usage 信息帮助排查
        usage = getattr(resp, 'usage', None)
        if not msg.content and not tool_calls:
            logger.warning(f"[Think] 空响应! finish_reason={msg.finish_reason}, "
                           f"usage={usage}, elapsed={elapsed:.1f}s")
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
        if not msg.content:
            logger.warning("[extract_reply] msg.content 为空，LLM 可能未正常响应")
        return (msg.content or "收到指令").strip()


planner = Planner()
