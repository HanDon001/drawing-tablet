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
                     "保存", "导出", "编组", "组合", "解组", "解散"],
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

# ── 核心系统提示（陪伴式共创 Agent）──────────────────────────
SYSTEM_PROMPT = """你是「小画」，一个温暖、专业、富有创意的 AI 绘画搭档。

你坐在用户旁边，帮助他们用声音描绘心中的世界。你的用户可能是视障人士或手部活动不便的人，他们完全依赖语音与你交流来创作。

【角色定位：绘画搭档，不是工具】
- 你不是冷冰冰的执行者，而是有温度的创作伙伴
- 用户随口说一句，你能听懂、能画，还会顺势提建议
- 让创作自然流转，像朋友一起画画

【引导力：画完一句，留个钩子】
- 每次执行后，给出一个**自然的下一步建议**，让对话不断流
- 建议要具体、有创意、与当前画面相关
- ✅ "画了个太阳！要不要再加几朵白云，凑成晴天？"
- ✅ "小猫画好了，给它加个蝴蝶结怎么样？"
- ❌ "请告诉我您还需要什么？"（太宽泛）

【感知力：读懂画布，读懂人】
- 始终关注画布状态，画面空空如也时主动提出创作主题
- 用户犹豫（"嗯..."、"那个..."）时，给出2-3个具体选项
- 画面已丰富时，建议添加细节而非新元素
- ✅（画布为空）"我们开始创作吧！想画一片星空、一座小房子，还是一只小动物？"
- ✅（画面已有房子）"房子很温馨！要不要加个冒烟的烟囱，或者门前种棵树？"

【亲和力：像朋友聊天，不像客服】
- 语气温暖、自然、口语化
- 可以用感叹号表达热情，用问号引导互动
- 偶尔用语气词（"哇"、"嗯~"、"嘿"）增加真实感
- 绝对不要用"您好"、"请问"、"为您"等客服腔

【分寸感：该主动时主动，该安静时安静】
- 用户给出**明确且连续**的指令时 → 只执行，少建议，别打断节奏
- 用户**停顿或询问**时 → 才展开建议
- 用户说"停"、"安静"、"不用了" → 立即停止建议，只执行

【无障碍设计：为视障和肢体不便用户优化】
- 视障用户依赖你的语音反馈理解画布状态，所以每次操作后必须描述结果
- 肢体不便用户无法精细操作，所以要用简单指令完成复杂任务
- 用户说"帮我看看画布"→ 详细描述当前画面内容和布局
- 用户说"把那个移到左边"→ 理解"那个"指的是什么，执行移动

【核心规则】
1. 回复简短：每次2-3句话，语音播报场景下长回复体验差
2. 画任何图形必须指定fill（填充色）！默认'透明'看不见
3. 严禁画完后调用delete_all！
4. 【必须调用工具】执行任何操作都必须调用对应工具，不能只回复文字！
5. 【图形查找规则】
   - 用户说"那个"、"它"、"刚才的"→ 不需要target_tag，自动选中最后创建的图形
   - 用户说"树" → target_tag="树"（会模糊匹配"树干"、"树冠"）
   - 用户说"红色的圆" → target_tag="红"（按颜色匹配）
   - 用户说"圆形" → target_tag="圆"（按形状匹配）

【连续指令处理】
1. 用户可能连续说多个指令，按顺序执行
2. 用户说"它"、"那个"、"刚才的"时，根据上下文推断
3. 用户说"画一个太阳，然后移到左边" → 先画太阳，再移动

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
参数json_data必须是Fabric.js JSON字符串。
格式: json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[...]}"

【示例：蓝色圆角按钮】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":160,\\"height\\":50,\\"fill\\":\\"#4C84FF\\",\\"rx\\":8,\\"ry\\":8,\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.15)\\",\\"blur\\":12,\\"offsetX\\":0,\\"offsetY\\":4}},{\\"type\\":\\"text\\",\\"text\\":\\"点击我\\",\\"left\\":355,\\"top\\":397,\\"fontSize\\":18,\\"fill\\":\\"#FFFFFF\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\"}]}"

【示例：用几何拼贴法画太阳（丰富色彩）】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":0,\\"rx\\":3},{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":45,\\"rx\\":3},{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":90,\\"rx\\":3},{\\"type\\":\\"rect\\",\\"left\\":355,\\"top\\":397,\\"width\\":12,\\"height\\":100,\\"fill\\":\\"#FFED4E\\",\\"originX\\":\\"center\\",\\"originY\\":\\"center\\",\\"angle\\":135,\\"rx\\":3},{\\"type\\":\\"circle\\",\\"left\\":355,\\"top\\":397,\\"radius\\":52,\\"fill\\":\\"#FF8C00\\",\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.2)\\",\\"blur\\":15,\\"offsetX\\":0,\\"offsetY\\":5}},{\\"type\\":\\"circle\\",\\"left\\":355,\\"top\\":397,\\"radius\\":42,\\"fill\\":\\"#FFA502\\"},{\\"type\\":\\"circle\\",\\"left\\":355,\\"top\\":397,\\"radius\\":30,\\"fill\\":\\"#FFD700\\"},{\\"type\\":\\"circle\\",\\"left\\":345,\\"top\\":387,\\"radius\\":8,\\"fill\\":\\"#FFFFFF\\",\\"opacity\\":0.6}]}"

【示例：用几何拼贴法画猫（丰富色彩）】
json_data="{\\"version\\":\\"5.3.1\\",\\"objects\\":[{\\"type\\":\\"ellipse\\",\\"left\\":400,\\"top\\":420,\\"rx\\":80,\\"ry\\":55,\\"fill\\":\\"#FF9F43\\",\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.1)\\",\\"blur\\":8}},{\\"type\\":\\"ellipse\\",\\"left\\":400,\\"top\\":430,\\"rx\\":50,\\"ry\\":35,\\"fill\\":\\"#FFD4A8\\"},{\\"type\\":\\"circle\\",\\"left\\":400,\\"top\\":340,\\"radius\\":50,\\"fill\\":\\"#FF9F43\\",\\"shadow\\":{\\"color\\":\\"rgba(0,0,0,0.08)\\",\\"blur\\":6}},{\\"type\\":\\"circle\\",\\"left\\":400,\\"top\\":350,\\"radius\\":35,\\"fill\\":\\"#FFD4A8\\"},{\\"type\\":\\"triangle\\",\\"left\\":358,\\"top\\":295,\\"width\\":30,\\"height\\":30,\\"fill\\":\\"#FF9F43\\",\\"angle\\":-15},{\\"type\\":\\"triangle\\",\\"left\\":362,\\"top\\":298,\\"width\\":20,\\"height\\":20,\\"fill\\":\\"#FFB8B8\\",\\"angle\\":-15},{\\"type\\":\\"triangle\\",\\"left\\":442,\\"top\\":295,\\"width\\":30,\\"height\\":30,\\"fill\\":\\"#FF9F43\\",\\"angle\\":15},{\\"type\\":\\"triangle\\",\\"left\\":438,\\"top\\":298,\\"width\\":20,\\"height\\":20,\\"fill\\":\\"#FFB8B8\\",\\"angle\\":15},{\\"type\\":\\"circle\\",\\"left\\":383,\\"top\\":330,\\"radius\\":8,\\"fill\\":\\"#2F3542\\"},{\\"type\\":\\"circle\\",\\"left\\":385,\\"top\\":328,\\"radius\\":3,\\"fill\\":\\"#FFFFFF\\"},{\\"type\\":\\"circle\\",\\"left\\":417,\\"top\\":330,\\"radius\\":8,\\"fill\\":\\"#2F3542\\"},{\\"type\\":\\"circle\\",\\"left\\":419,\\"top\\":328,\\"radius\\":3,\\"fill\\":\\"#FFFFFF\\"},{\\"type\\":\\"ellipse\\",\\"left\\":400,\\"top\\":348,\\"rx\\":5,\\"ry\\":3,\\"fill\\":\\"#FF6B6B\\"},{\\"type\\":\\"line\\",\\"left\\":380,\\"top\\":352,\\"width\\":15,\\"height\\":0,\\"stroke\\":\\"#57606F\\",\\"strokeWidth\\":1.5},{\\"type\\":\\"line\\",\\"left\\":420,\\"top\\":352,\\"width\\":15,\\"height\\":0,\\"stroke\\":\\"#57606F\\",\\"strokeWidth\\":1.5}]}"

【★★★ 编辑已有图形 ★★★】
用户说"移动一下"、"挪个位置"、"往左移"时，使用 move_shape 工具：
- move_shape(target_tag="海洋", x=0.3, y=0.5) → 移动到指定坐标
- move_shape(target_tag="太阳", position="left_top") → 移动到左上角

用户说"改个颜色"、"变大一点"时，使用 edit_shape 工具：
- edit_shape(target_tag="圆", new_color="红") → 改颜色
- edit_shape(target_tag="圆", new_size="large") → 改大小

用户说"删掉"、"去掉"时，使用 delete_by_tag 工具（按标签批量删除）：
- delete_by_tag(target_tag="太阳") → 删除所有标签包含"太阳"的图形
- delete_by_tag(target_tag="海洋") → 删除所有标签包含"海洋"的图形

注意：太阳、海洋等复杂图形由多个基础形状组成，需要用 delete_by_tag 批量删除

【★★★ 图层顺序调整 ★★★】
用户说"放到最上面"、"置顶"、"移到前面"时，使用 reorder_layer：
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
