"""
LLM 服务 — 带对话历史的薄封装层
"""

from typing import Dict, Any, Optional, List
from loguru import logger
from ..agent.react import agent as react_agent

# ── 对话历史（内存，最近10轮） ──────────────────────
MAX_HISTORY = 10
_conversation: List[Dict[str, str]] = []  # [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]


def _add_history(role: str, content: str):
    _conversation.append({"role": role, "content": content})
    if len(_conversation) > MAX_HISTORY * 2:
        _conversation.pop(0)
        _conversation.pop(0)


def _get_history_text() -> str:
    """将历史转为文本摘要，注入到 canvas_context 中"""
    if not _conversation:
        return ""
    lines = []
    for msg in _conversation[-6:]:  # 最近3轮
        role = "用户" if msg["role"] == "user" else "小画"
        lines.append(f"{role}: {msg['content'][:80]}")
    return "【最近对话】\n" + "\n".join(lines)


async def chat(text: str, canvas_context: Optional[str] = None,
               is_proactive: bool = False) -> Dict[str, Any]:
    if is_proactive:
        return {"reply": _proactive_reply(), "actions": []}

    # 注入对话历史到上下文
    history = _get_history_text()
    full_context = f"{canvas_context or ''}\n\n{history}".strip()

    logger.info(f"[LLM] 指令: '{text[:50]}' 历史:{len(_conversation)//2}轮")
    result = await react_agent.run(text, full_context)

    # 记录对话
    _add_history("user", text)
    _add_history("assistant", result.get("reply", ""))

    return result


def _proactive_reply() -> str:
    import random
    return random.choice([
        "嘿，还在构思吗？我们可以画点新东西，比如一片星空或者一只小动物～",
        "嗯~ 画布有点安静呢，要不要加点什么？比如一朵云或者一颗星星？",
        "想好画什么了吗？我随时准备好了！",
        "我们可以继续创作哦，比如给画面加点颜色或者小装饰～",
        "有什么想法吗？哪怕是模糊的描述，我也能帮你画出来！",
    ])
