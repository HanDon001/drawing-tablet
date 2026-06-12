"""
永久循环 Agent
不是请求-响应模式，而是持续陪伴模式

状态机: idle → listening → processing → speaking → idle
空闲 30 秒主动关怀
"""

import json
import time
import asyncio
from typing import Dict, List, Any, Optional
from loguru import logger

from .config import settings
from .agent import Agent


class ConversationContext:
    """对话上下文管理（短期记忆）"""

    def __init__(self, max_turns: int = 5):
        self.history: List[Dict[str, str]] = []
        self.max_turns = max_turns

    def add(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        if len(self.history) > self.max_turns * 2:
            self.history = self.history[-self.max_turns * 2:]

    def get_messages(self, system_prompt: str, canvas_context: str) -> List[Dict[str, str]]:
        messages = [
            {"role": "system", "content": f"""{system_prompt}

当前画布状态：
{canvas_context}

你是一个温柔的绘画助手。每完成一个操作，用温和的语气告诉用户你做了什么。
如果用户说"它"、"刚才那个"，根据上下文推断指的是哪个图形。
回复简洁（<30字），口语化，不要用 Markdown。"""},
        ]
        messages.extend(self.history)
        return messages

    def clear(self):
        self.history.clear()


class CanvasState:
    """画布状态管理（给 AI 用）"""

    def __init__(self):
        self.objects: List[Dict] = []
        self.last_mouse_target: Optional[str] = None
        self.last_voice_target: Optional[str] = None
        self.last_created: Optional[str] = None

    def update(self, objects: List[Dict]):
        self.objects = objects

    def to_context(self) -> str:
        if not self.objects:
            return "画布为空，没有任何图形。"

        pos_names = {
            "center": "中间", "left_top": "左上角", "top": "上方", "right_top": "右上角",
            "left": "左边", "right": "右边",
            "left_bottom": "左下角", "bottom": "下方", "right_bottom": "右下角",
        }
        shape_names = {
            "circle": "圆", "rectangle": "方块", "triangle": "三角形", "line": "线",
            "star": "星", "diamond": "菱形", "arrow": "箭头", "hexagon": "六边形",
        }

        descs = []
        for obj in self.objects:
            pos = pos_names.get(obj.get("position", ""), obj.get("position", ""))
            shape = shape_names.get(obj.get("shape", ""), obj.get("shape", ""))
            color = obj.get("color", "")
            tag = obj.get("tag", "")
            tag_info = f'，叫"{tag}"' if tag else ""
            opacity = obj.get("opacity", 1)
            opacity_info = f"，透明度{opacity}" if opacity < 1 else ""
            descs.append(f"{pos}有一个{color}的{shape}{tag_info}{opacity_info}")

        return f"画布上有{len(self.objects)}个图形：{'；'.join(descs)}。"

    def describe_for_user(self) -> str:
        """给视障用户的空间描述"""
        if not self.objects:
            return "画布上还没有任何图形。"
        return f"画布上有{len(self.objects)}个图形。{self.to_context()}"

    def is_empty(self) -> bool:
        return len(self.objects) == 0

    def count(self) -> int:
        return len(self.objects)

    def resolve_reference(self, text: str) -> Optional[str]:
        """解析指代词（"它"、"刚才那个"）"""
        if any(w in text for w in ["它", "这个", "那个", "刚才"]):
            return self.last_mouse_target or self.last_voice_target or self.last_created
        return None


class UserPreferences:
    """用户偏好记忆（学习用户习惯）"""

    def __init__(self):
        self.color_freq = {}
        self.shape_freq = {}
        self.position_freq = {}
        self.command_count = 0

    def learn(self, action: Dict):
        """从用户指令中学习偏好"""
        params = action.get("params", {})
        self.command_count += 1

        if "color" in params:
            c = params["color"]
            self.color_freq[c] = self.color_freq.get(c, 0) + 1

        if "shape_type" in params:
            s = params["shape_type"]
            self.shape_freq[s] = self.shape_freq.get(s, 0) + 1

        if "position" in params:
            p = params["position"]
            self.position_freq[p] = self.position_freq.get(p, 0) + 1

    def suggest(self) -> str:
        """基于偏好给出建议"""
        if self.command_count < 2:
            return ""

        suggestions = []

        if self.color_freq:
            top_color = max(self.color_freq, key=self.color_freq.get)
            if self.color_freq[top_color] >= 2:
                suggestions.append(f"你好像喜欢{top_color}色")

        if self.shape_freq:
            top_shape = max(self.shape_freq, key=self.shape_freq.get)
            shape_names = {
                "circle": "圆", "rectangle": "方块", "triangle": "三角形", "line": "线",
                "star": "星", "diamond": "菱形", "arrow": "箭头", "hexagon": "六边形",
            }
            name = shape_names.get(top_shape, top_shape)
            if self.shape_freq[top_shape] >= 2:
                suggestions.append(f"常画{name}")

        if suggestions:
            return "，".join(suggestions) + "。要继续画吗？"
        return ""

    def get_favorite_color(self) -> str:
        if self.color_freq:
            return max(self.color_freq, key=self.color_freq.get)
        return "黑"


class AgentLoop:
    """
    永久循环 Agent

    不是每次请求新建，而是持续运行的陪伴式 Agent
    """

    TONE_TEMPLATES = {
        "confirm": [
            "好的，{action}了。",
            "完成啦，{action}。",
            "已经{action}了哦。",
            "弄好了，{action}。",
        ],
        "error": [
            "没关系，{reason}，我们再试一次。",
            "出了点小问题，{reason}。",
            "抱歉，{reason}，你能再说一次吗？",
        ],
        "greeting": [
            "你好呀，我是小画，你的语音绘画助手。",
            "嗨，我在这里，随时帮你画画。",
        ],
        "idle_care": [
            "还在吗？需要帮忙吗？",
            "我在这里，随时告诉我你想画什么。",
            "画布上有{count}个图形，想修改什么吗？",
        ],
        "empty_canvas": [
            "画布还是空的呢，想画点什么吗？你可以说'画一个红色的圆'。",
            "画布上什么都没有，告诉我你想画什么吧。",
        ],
    }

    def __init__(self):
        self.agent = Agent()
        self.context = ConversationContext(max_turns=5)
        self.canvas = CanvasState()
        self.prefs = UserPreferences()
        self.state = "idle"
        self.last_activity = time.time()
        self.idle_timeout = 30  # 30 秒无操作触发关怀
        self._ws = None
        self._running = False

    def _pick(self, key: str, **kwargs) -> str:
        """随机选一个语气模板"""
        import random
        templates = self.TONE_TEMPLATES.get(key, ["好的。"])
        text = random.choice(templates)
        for k, v in kwargs.items():
            text = text.replace(f"{{{k}}}", str(v))
        return text

    async def process_input(self, text: str):
        """处理用户输入"""
        self.state = "processing"
        logger.info(f"Agent 处理: {text}")

        # 加入上下文
        self.context.add("user", text)

        # 解析指代词
        ref = self.canvas.resolve_reference(text)
        if ref:
            text = text.replace("它", ref).replace("这个", ref).replace("那个", ref)

        # 调用 LLM
        canvas_ctx = self.canvas.to_context()
        messages = self.context.get_messages("", canvas_ctx)

        try:
            result = await self.agent.chat(text, canvas_ctx)

            # 执行动作 + 学习偏好
            if result.get("actions"):
                for action in result["actions"]:
                    self.prefs.learn(action)
                    await self.send_action(action)

            # 播报结果
            reply = result.get("reply", "好的。")
            self.context.add("assistant", reply)
            await self.send_speak(reply)

        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            await self.send_speak(self._pick("error", reason="网络不太好"))

        self.state = "idle"

    async def proactive_care(self):
        """主动关怀（带偏好建议）"""
        if self.canvas.is_empty():
            msg = self._pick("empty_canvas")
            # 基于偏好建议
            suggestion = self.prefs.suggest()
            if suggestion:
                msg += suggestion
        else:
            msg = self._pick("idle_care", count=self.canvas.count())

        await self.send_speak(msg)
        self.last_activity = time.time()

    async def send_speak(self, text: str):
        """发送播报指令到前端"""
        if self._ws:
            await self._ws.send_json({"type": "speak", "text": text})

    async def send_action(self, action: Dict):
        """发送动作指令到前端"""
        if self._ws:
            await self._ws.send_json({"type": "action", "action": action})

    def stop(self):
        """停止循环"""
        self._running = False

    def update_canvas(self, objects: List[Dict]):
        """前端同步画布状态"""
        self.canvas.update(objects)
