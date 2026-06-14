"""
Executor — 执行器
职责：工具别名解析、参数规范化、质量守门、工具执行
"""

import json
import re
from typing import Dict, Any, List, Tuple
from loguru import logger
from ..tools.registry import ToolRegistry

# ── 查询工具集合 ─────────────────────────────────────
QUERY_TOOLS = {"describe_canvas", "list_shapes", "get_shape_info"}

# ── 工具别名 ─────────────────────────────────────────
TOOL_ALIASES = {
    "draw_line": {"tool": "draw_shape", "extra": {"shape_type": "line"}},
    "draw_circle": {"tool": "draw_shape", "extra": {"shape_type": "circle"}},
    "draw_rectangle": {"tool": "draw_shape", "extra": {"shape_type": "rectangle"}},
    "draw_triangle": {"tool": "draw_shape", "extra": {"shape_type": "triangle"}},
    "draw_star": {"tool": "draw_shape", "extra": {"shape_type": "star"}},
    "draw_diamond": {"tool": "draw_shape", "extra": {"shape_type": "diamond"}},
    "draw_arrow": {"tool": "draw_shape", "extra": {"shape_type": "arrow"}},
    "draw_hexagon": {"tool": "draw_shape", "extra": {"shape_type": "hexagon"}},
    "move": "move_shape",
    "resize": "resize_shape",
    "delete": "delete_shape",
    "remove": "delete_shape",
    "clear": "delete_all",
    "describe": "describe_canvas",
}

# ── 中文参数映射 ─────────────────────────────────────
_SHAPE_MAP = {
    "圆形": "circle", "圆": "circle", "矩形": "rectangle", "方形": "rectangle",
    "三角形": "triangle", "三角": "triangle", "直线": "line", "线": "line",
    "星形": "star", "星": "star", "菱形": "diamond", "箭头": "arrow",
    "六边形": "hexagon",
}
_COLOR_MAP = {
    "红色": "红", "蓝色": "蓝", "绿色": "绿", "黄色": "黄", "紫色": "紫",
    "橙色": "橙", "粉色": "粉", "黑色": "黑", "白色": "白", "灰色": "灰",
}
_SIZE_MAP = {"小": "small", "中": "medium", "大": "large", "中等": "medium"}

# ── 复杂 Path 检测关键词 ──────────────────────────────
ORGANIC_KEYWORDS = [
    "猫", "狗", "人", "鸟", "鱼", "龙", "动物", "人物", "肖像",
    "花", "树", "云", "山", "海", "风景", "蝴蝶", "兔子",
]


class Executor:
    """
    执行器：负责将 LLM 的工具调用决策转化为实际操作
    - 解析工具别名
    - 规范化参数
    - 【新增】质量守门：拦截复杂有机 Path
    - 【新增】图标搜索：知名 Logo 自动查 SVG
    - 执行工具并返回结果
    """

    def resolve_alias(self, name: str, args: dict) -> Tuple[str, dict]:
        alias = TOOL_ALIASES.get(name)
        if alias is None:
            return name, args
        if isinstance(alias, str):
            return alias, args
        return alias["tool"], {**alias.get("extra", {}), **args}

    def normalize_args(self, args: dict) -> dict:
        if "shape" in args:
            args["shape_type"] = _SHAPE_MAP.get(args.pop("shape"), args["shape"])
        for k in ("color", "stroke_color", "new_color", "new_stroke_color"):
            if k in args:
                args[k] = _COLOR_MAP.get(args[k], args[k])
        if "size" in args:
            args["size"] = _SIZE_MAP.get(args["size"], args["size"])
        if "radius" in args and "size" not in args:
            r = args.pop("radius")
            if isinstance(r, (int, float)):
                args["size"] = "small" if r <= 0.12 else ("large" if r > 0.2 else "medium")
        else:
            args.pop("radius", None)
        return args

    def _has_organic_intent(self, messages: list) -> bool:
        """从对话历史中检测是否有画有机体的意图"""
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if any(kw in content for kw in ORGANIC_KEYWORDS):
                    return True
        return False

    def _count_complex_paths(self, json_data: str) -> int:
        """统计 JSON 中包含 C/Q 命令的 path 数量"""
        try:
            data = json.loads(json_data) if isinstance(json_data, str) else json_data
            objects = data.get("objects", [])
            count = 0
            for obj in objects:
                if obj.get("type") == "path":
                    path_str = obj.get("path", "")
                    # 检测贝塞尔曲线命令
                    if re.search(r'[CQCSQT]', str(path_str)):
                        count += 1
            return count
        except Exception:
            return 0

    def _count_basic_shapes(self, json_data: str) -> int:
        """统计基础几何图形数量"""
        try:
            data = json.loads(json_data) if isinstance(json_data, str) else json_data
            objects = data.get("objects", [])
            count = 0
            for obj in objects:
                if obj.get("type") in ("rect", "ellipse", "circle", "triangle", "text", "line", "group"):
                    count += 1
            return count
        except Exception:
            return 0

    def _validate_fabric_json(self, name: str, args: dict, messages: list) -> Tuple[str, dict]:
        """
        质量守门员：拦截不合理的复杂 Path 调用
        返回: (最终工具名, 最终参数)
        """
        if name != "inject_fabric_json":
            return name, args

        json_data = args.get("json_data", "")
        if not json_data:
            return name, args

        complex_paths = self._count_complex_paths(json_data)
        basic_shapes = self._count_basic_shapes(json_data)
        has_organic = self._has_organic_intent(messages)

        # 规则1: 如果有有机体意图，且复杂 Path > 基础图形，拦截
        if has_organic and complex_paths > basic_shapes:
            logger.warning(
                f"[Executor] 质量拦截: 检测到有机体意图+{complex_paths}个复杂Path>"
                f"{basic_shapes}个基础图形，拒绝执行"
            )
            # 返回错误信息，触发 LLM 重试或降级
            args["_blocked"] = True
            args["_block_reason"] = (
                f"质量拦截: 检测到{complex_paths}个复杂贝塞尔Path，"
                f"画有机体会严重变形。请改用几何拼贴法(rect/ellipse/triangle组合)，"
                f"或调用generate_vector_art生成像素图。"
            )
            return name, args

        # 规则2: 即使无有机体意图，复杂 Path 过多也警告
        if complex_paths > 5 and basic_shapes < 2:
            logger.warning(f"[Executor] 质量警告: {complex_paths}个复杂Path，可能变形")
            # 不拦截，但在结果中附加警告

        return name, args

    async def execute_one(self, name: str, args: dict, canvas_context: str = "") -> str:
        """执行单个工具"""

        # 质量拦截检查
        if args.get("_blocked"):
            reason = args.pop("_block_reason", "质量拦截")
            logger.info(f"[Executor] 拦截 {name}: {reason}")
            return reason

        if name in QUERY_TOOLS:
            result = canvas_context or "画布为空"
            logger.info(f"[Executor] 查询 {name} → 画布上下文")
        else:
            try:
                result = await ToolRegistry.execute(name, args)
            except Exception as e:
                error_msg = str(e)
                logger.error(f"[Executor] 执行 {name} 异常: {error_msg}")
                result = f"执行错误: {error_msg}。请检查参数格式并重试。"

            # 错误结果修复建议
            if result and isinstance(result, str):
                if "错误" in result or "失败" in result or "error" in result.lower():
                    if name == "inject_fabric_json":
                        result += "\n修复建议: json_data必须是有效JSON字符串，含version和objects。不要用复杂path画有机体！"
                    elif name == "create_fabric_object":
                        result += "\n修复建议: object_type须为rect/circle/triangle/text/line之一。"

            logger.info(f"[Executor] 执行 {name}({str(args)[:80]}) → {result[:80]}")
        return result

    async def run_batch(
        self, tool_calls: List[Dict], canvas_context: str = "", messages: list = None
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        批量执行工具调用
        参数: tool_calls = [{"id","name","args"}, ...]
        返回: (actions_list, tool_messages_list)
        """
        actions = []
        tool_messages = []
        messages = messages or []

        for tc in tool_calls:
            # 1. 别名解析
            name, args = self.resolve_alias(tc["name"], tc["args"])
            # 2. 参数规范化
            args = self.normalize_args(args)
            # 3. 质量守门
            name, args = self._validate_fabric_json(name, args, messages)
            # 4. 执行
            result = await self.execute_one(name, args, canvas_context)

            # 构建 action
            action = {"tool": name, "params": args}
            # 提取结构化数据
            if isinstance(result, str):
                try:
                    json_start = result.find("{")
                    if json_start >= 0:
                        result_data = json.loads(result[json_start:])
                        if result_data.get("type") in ("fabric_json", "vector_art", "icon_svg"):
                            action["result"] = result_data
                except (json.JSONDecodeError, ValueError):
                    pass
            elif isinstance(result, dict):
                if result.get("type") in ("fabric_json", "vector_art", "icon_svg"):
                    action["result"] = result

            actions.append(action)
            tool_messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result if isinstance(result, str) else json.dumps(result, ensure_ascii=False),
            })

        return actions, tool_messages


executor = Executor()
