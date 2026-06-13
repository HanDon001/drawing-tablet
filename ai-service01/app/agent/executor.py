"""
Executor — 执行器
职责：工具别名解析、参数规范化、工具执行
"""

from typing import Dict, Any, List, Tuple
from loguru import logger
from ..tools.registry import ToolRegistry

# ── 查询工具集合（返回画布上下文而非 stub） ─────────
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


class Executor:
    """
    执行器：负责将 LLM 的工具调用决策转化为实际操作
    - 解析工具别名（draw_line → draw_shape）
    - 规范化参数（中文→英文，字段名对齐）
    - 执行工具并返回结果
    """

    def resolve_alias(self, name: str, args: dict) -> Tuple[str, dict]:
        """工具别名解析"""
        alias = TOOL_ALIASES.get(name)
        if alias is None:
            return name, args
        if isinstance(alias, str):
            return alias, args
        return alias["tool"], {**alias.get("extra", {}), **args}

    def normalize_args(self, args: dict) -> dict:
        """中文参数 → 英文，字段名对齐前端期望"""
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

    def execute_one(self, name: str, args: dict, canvas_context: str = "") -> str:
        """
        执行单个工具
        - 查询工具：返回真实画布上下文
        - 其他工具：调用 ToolRegistry.execute
        """
        if name in QUERY_TOOLS:
            result = canvas_context or "画布为空"
            logger.info(f"[Executor] 查询 {name} → 画布上下文")
        else:
            result = ToolRegistry.execute(name, args)
            logger.info(f"[Executor] 执行 {name}({args}) → {result[:60]}")
        return result

    def run_batch(self, tool_calls: List[Dict], canvas_context: str = "") -> Tuple[List[Dict], List[Dict]]:
        """
        批量执行工具调用
        参数: tool_calls = [{"id","name","args"}, ...]
        返回: (actions_list, tool_messages_list)
          - actions_list: [{"tool","params"}, ...] 供前端执行
          - tool_messages_list: [{"role":"tool","tool_call_id","content"}, ...] 供 LLM 观察
        """
        actions = []
        messages = []

        for tc in tool_calls:
            # 1. 别名解析
            name, args = self.resolve_alias(tc["name"], tc["args"])
            # 2. 参数规范化
            args = self.normalize_args(args)
            # 3. 执行
            result = self.execute_one(name, args, canvas_context)

            action = {"tool": name, "params": args}
            # 矢量图生成工具：将结果中的路径数据传递给前端
            if name == "generate_vector_art" and "type" in str(result):
                import json
                try:
                    # 从结果字符串中提取 JSON 数据
                    json_start = result.find("{")
                    if json_start >= 0:
                        result_data = json.loads(result[json_start:])
                        if result_data.get("type") == "vector_art":
                            action["result"] = result_data
                except (json.JSONDecodeError, ValueError):
                    pass
            actions.append(action)
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

        return actions, messages


# 全局实例
executor = Executor()
