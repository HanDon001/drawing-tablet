"""
Planner — 思考器
职责：路由决策 + 工具调用规划

两层架构:
  1. Router (快): 小模型判断需要哪类工具
  2. Think  (准): 大模型只看相关工具，决定具体调用
"""

import json
import re
import asyncio
from typing import Dict, Any, Optional, List, Tuple
from openai import AsyncOpenAI
from loguru import logger
from ..config import settings
from ..tools.registry import ToolRegistry


# ── 工具分组 ──────────────────────────────────────────
TOOL_GROUPS = {
    "draw": {
        "desc": "绘制基本几何图形：圆、方、线、星、三角、箭头。不包含云/树/心/花等复杂图形。",
        "keywords": ["画", "绘制", "画一个", "画个", "帮我画", "房子", "星", "线", "圆", "方", "三角"],
        "tools": ["draw_shape", "draw_multiple", "draw_freehand_path", "draw_preset_pattern"],
    },
    "edit": {
        "desc": "编辑已有图形：改颜色、改大小、移动、旋转、透明度、边框、填充",
        "keywords": ["改", "修改", "变", "大", "小", "移动", "旋转", "透明", "边框", "填充", "颜色"],
        "tools": ["edit_shape", "move_shape", "resize_shape", "rotate_shape",
                  "set_opacity", "set_stroke", "fill_area"],
    },
    "delete": {
        "desc": "删除图形：删掉某个、清空、撤销",
        "keywords": ["删", "删除", "清空", "清除", "撤销", "去掉", "移除"],
        "tools": ["delete_object", "delete_all", "trigger_ui_action", "undo", "redo"],
    },
    "query": {
        "desc": "查看画布：有什么、看看、描述、详情",
        "keywords": ["看看", "有什么", "描述", "详情", "查看", "列出"],
        "tools": ["list_shapes", "describe_canvas", "get_shape_info"],
    },
    "control": {
        "desc": "操控工具：切换画笔/橡皮、设置画笔参数",
        "keywords": ["画笔", "橡皮", "橡皮擦", "笔刷", "粗细", "切换工具"],
        "tools": ["set_active_tool", "set_brush_params"],
    },
    "theme": {
        "desc": "主题画作：星空、太阳、房子主题",
        "keywords": ["主题", "星空"],
        "tools": ["create_theme", "list_themes"],
    },
    "ai": {
        "desc": "AI生成图片",
        "keywords": ["AI生成", "AI画", "生成图片"],
        "tools": ["ai_generate_image", "ai_redraw_region", "set_drawing_mode"],
    },
    "vector": {
        "desc": "参数化矢量图形：心形、螺旋、波浪、齿轮、树、云、闪电、花朵。用预置模板快速绘制。",
        "keywords": ["心形", "螺旋", "波浪", "齿轮", "云朵", "云", "闪电", "花朵", "花", "svg", "曲线", "贝塞尔", "树"],
        "tools": ["add_vector_shape", "draw_svg_path"],
        "exclusive": True,
        "excludes": ["draw"],
    },
    "vector_gen": {
        "desc": "AI矢量图生成：用文生图模型生成复杂插画/Logo/图标/动物/人物/场景，自动转为矢量路径。适合画复杂图形。",
        "keywords": ["生成矢量", "矢量图", "矢量", "AI矢量", "插画", "logo", "图标", "猫咪", "猫", "狗", "人物", "风景", "卡通"],
        "tools": ["generate_vector_art"],
        "exclusive": True,
        "excludes": ["draw", "vector"],
    },
}

# ── 系统提示 ──────────────────────────────────────────
SYSTEM_PROMPT = """你是一个名叫"小画"的语音绘图助手。

【核心规则】
1. 回复极简短：一句话确认，15字以内。如"好的，太阳画好了"。
2. 画任何图形必须指定color参数！默认"无"是透明看不见的。
3. 颜色语义：太阳=红, 天空=蓝, 草地=绿, 云=白, 树=绿, 苹果=红。
4. 删除时用delete_object传对象ID（从画布状态中获取）。
5. 用户说"看看"→ describe_canvas。

【坐标系】
- 画布坐标系: x(0-1) y(0-1), (0,0)=左上角, (0.5,0.5)=正中心, (1,1)=右下角
- 坐标可超出0-1（如-0.2或1.3），图形会部分在画布外
- 精确定位：画左上角→(0.2,0.2), 画中心→(0.5,0.5), 画右下→(0.8,0.8)

【大小】
- small=40px(小), medium=80px(中), large=140px(大), 也可传数字如120
- 多个图形要协调：主体用large，装饰用small，连接件用medium

【布局原则】
- 多个图形组成画面时，注意间距和对齐
- 相邻图形间距建议0.05-0.1（坐标单位）
- 对齐：同一水平线用相同y值，同一垂直线用相同x值
- 层次：大图形在底层，小图形在上层（后绘制的在上面）

【颜色】可用: 红/蓝/绿/黄/紫/橙/粉/黑/白/灰。'无'=透明。金色→黄。支持十六进制如#FF6B6B。

【矢量规则】
- 必须用add_vector_shape画: heart/spiral/wave/gear/tree/cloud/lightning/flower
- 禁止用draw_shape或draw_multiple画这些类型！
- 用户说"画云/树/心/花/闪电"时，必须调用add_vector_shape

【AI矢量】
- 用户说"生成矢量图/插画/logo/猫咪/狗/人物/风景"时，必须用generate_vector_art
- draw_multiple只能画简单几何组合（圆+三角），不能画猫/狗/人物等复杂图形"""


# ── DSML 文本解析回退 ─────────────────────────────────
def _parse_dsml(text: str) -> List[Dict[str, Any]]:
    actions = []
    invoke_re = r'<\｜\｜DSML\｜\｜invoke\s+name="([^"]+)">(.*?)</\｜\｜DSML\｜\｜invoke>'
    param_re = r'<\｜\｜DSML\｜\｜parameter\s+name="([^"]+)"\s+string="(true|false)">(.*?)</\｜\｜DSML\｜\｜parameter>'
    for m in re.finditer(invoke_re, text, re.DOTALL):
        name, block = m.group(1), m.group(2)
        args = {}
        for pm in re.finditer(param_re, block, re.DOTALL):
            k, is_str, v = pm.group(1), pm.group(2) == "true", pm.group(3).strip()
            if not is_str:
                try: v = json.loads(v)
                except: pass
            args[k] = v
        actions.append({"tool": name, "params": args})
    return actions


# ── Planner ───────────────────────────────────────────
class Planner:

    def __init__(self):
        self._client: Optional[AsyncOpenAI] = None
        self._all_tools: Optional[dict] = None  # name → schema

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

    # ── 第1层：路由决策（快，不用工具） ──────────────
    async def route(self, user_text: str) -> List[str]:
        """
        轻量级路由：判断用户意图需要哪几类工具
        返回: 工具组名列表，如 ["draw", "edit"]
        """
        # 快速关键词匹配
        matched = set()
        text_lower = user_text.lower()
        for group_name, group in TOOL_GROUPS.items():
            for kw in group["keywords"]:
                if kw in text_lower:
                    matched.add(group_name)
                    break

        # exclusive 组优先：根据 excludes 字段移除冲突组
        # 优先级：vector_gen > vector > draw
        exclusive_matched = sorted(
            [g for g in matched if TOOL_GROUPS.get(g, {}).get("exclusive")],
            key=lambda g: len(TOOL_GROUPS[g].get("excludes", [])),
            reverse=True
        )
        if exclusive_matched:
            keep = set()
            remove = set()
            for g in exclusive_matched:
                if g in remove:
                    continue  # 已被更高优先级排除
                keep.add(g)
                remove.update(TOOL_GROUPS[g].get("excludes", ["draw"]))
            matched = (matched - remove) | keep
            logger.info(f"[Router] exclusive 优先: {keep}, 移除 {remove}")

        # 如果关键词匹配到了，直接返回
        if matched:
            logger.info(f"[Router] 关键词匹配: {matched}")
            return list(matched)

        # 关键词没匹配到，用小模型判断
        client = self.get_client()
        group_desc = "\n".join(f"- {k}: {v['desc']}" for k, v in TOOL_GROUPS.items())
        router_prompt = f"""你是工具路由器。根据用户指令，判断需要哪些工具组。
只返回JSON数组，如 ["draw","edit"]。不要解释。

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
            # 提取 JSON 数组
            match = re.search(r'\[.*?\]', text)
            if match:
                groups = json.loads(match.group())
                valid = [g for g in groups if g in TOOL_GROUPS]
                if valid:
                    logger.info(f"[Router] LLM路由: {valid}")
                    return valid
        except Exception as e:
            logger.warning(f"[Router] LLM路由失败: {e}")

        # 兜底：返回 draw（最常用）
        logger.info(f"[Router] 兜底: draw")
        return ["draw"]

    # ── 第2层：思考决策（准，只看相关工具） ──────────
    async def think(self, messages: list, tool_groups: List[str] = None) -> Tuple[Any, List[Dict], float]:
        """
        调用 LLM 思考，解析工具调用决策
        tool_groups: 路由结果，限定只用这些组的工具
        返回: (原始message, 工具调用列表, 耗时秒)
        """
        client = self.get_client()
        all_tools = self.get_all_tools()

        # 过滤工具：只保留路由命中的组
        if tool_groups:
            allowed_names = set()
            for g in tool_groups:
                if g in TOOL_GROUPS:
                    allowed_names.update(TOOL_GROUPS[g]["tools"])
            # 也保留基础工具（undo/delete_object 总是可用）
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
                max_tokens=800,
            ),
            timeout=settings.LLM_TIMEOUT,
        )
        elapsed = asyncio.get_event_loop().time() - t0

        msg = resp.choices[0].message
        tool_calls = self._parse_tool_calls(msg)
        return msg, tool_calls, elapsed

    def _parse_tool_calls(self, msg) -> List[Dict]:
        calls = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                try: args = json.loads(tc.function.arguments)
                except: args = {}
                calls.append({"id": tc.id, "name": tc.function.name, "args": args})
            return calls
        if msg.content and "DSML" in msg.content:
            parsed = _parse_dsml(msg.content)
            for i, a in enumerate(parsed):
                calls.append({"id": f"dsml_{i}", "name": a["tool"], "args": a["params"]})
        return calls

    def extract_reply(self, msg) -> str:
        return (msg.content or "收到指令").strip()


planner = Planner()
