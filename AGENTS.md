# VoiceCanvas 智能体工程化设计

## 1. 智能体架构 (Agent -> Skill -> Tool)

采用三层架构：

- **Agent**：大脑，负责意图识别、技能路由、上下文管理。
- **Skill**：技能包，处理特定领域的逻辑，提供 Prompt 和 Tool 集合。
- **Tool**：原子能力，具体的 API 调用或计算逻辑。

## 2. 工具定义

所有工具必须使用 `@ToolRegistry.register` 注册，确保被 Agent 发现。

### 2.1 绘图工具集

```python
# skills/draw/tools.py
from core.tool_registry import ToolRegistry

@ToolRegistry.register("draw_shape")
def draw_shape(shape_type: str, position: str, color: str = "black", size: str = "medium", tag: str = None):
    """在画布上绘制一个形状。
    Args:
        shape_type: 形状类型，枚举值 ["circle", "rectangle", "triangle", "line"]
        position: 位置，枚举值 ["center", "left_top", "left_bottom", "right_top", "right_bottom"]
        color: 颜色名称，默认黑色。
        size: 大小，枚举值 ["small", "medium", "large"]，默认 medium
        tag: 给图形打标签，用于后续指代
    """
    return "OK"

@ToolRegistry.register("edit_shape")
def edit_shape(target_tag: str, new_color: str = None, new_size: str = None, new_position: str = None):
    """修改画布上已有图形的属性。"""
    return "OK"
```

### 2.2 查询工具集

```python
# skills/query/tools.py
from core.tool_registry import ToolRegistry

@ToolRegistry.register("describe_canvas")
def describe_canvas():
    """描述当前画布上的内容，专为视障用户设计。无需参数。"""
    return "OK"
```

## 3. 技能定义

### 3.1 绘图技能

```python
# skills/draw/skill.py
from core.skill_base import BaseSkill
from skills.draw.tools import draw_shape, edit_shape

class DrawSkill(BaseSkill):
    def get_prompt(self) -> str:
        return """
        你现在是绘图模式。请根据用户指令调用相应的绘图工具。
        注意：如果用户没有指定颜色或大小，请使用默认值，不要反问。
        """
    
    def get_tools(self) -> list:
        return [draw_shape, edit_shape]
```

### 3.2 查询技能

```python
# skills/query/skill.py
from core.skill_base import BaseSkill
from skills.query.tools import describe_canvas

class QuerySkill(BaseSkill):
    def get_prompt(self) -> str:
        return """
        你现在是画布查询模式。视障用户想了解画面内容。
        请结合传入的画布上下文，用生动、包含空间方位的自然语言描述画面。
        绝对不要使用 Markdown 格式。
        """
    
    def get_tools(self) -> list:
        return [describe_canvas]
```

## 4. 系统全局提示词

```text
你是 VoiceCanvas 的智能语音助手"小画"，专为残障人士服务。

【全局规则】
1. 你的回复将被 TTS 播报，严禁使用 Markdown 格式，保持简短口语化。
2. 每次执行动作后，必须用自然语言确认结果。
3. 当用户说"它"、"刚才那个"时，需结合上下文解析。
4. 若遇到危险或不当请求，温和拒绝。
```
