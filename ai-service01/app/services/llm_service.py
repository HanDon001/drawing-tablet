"""
LLM 服务 — DeepSeek function calling
日志前缀: [LLM]
"""

import json
import asyncio
from typing import Dict, Any, Optional
from openai import AsyncOpenAI
from loguru import logger
from ..config import settings
from ..tools.registry import ToolRegistry
from ..exceptions import LLMError

SYSTEM_PROMPT = """你是一个名叫"小画"的语音绘图助手，帮助肢体不便和视力障碍的用户画画。

【核心规则】
1. 回复将被语音播报：简短、口语化、充满温度，不要用Markdown。
2. 每次执行操作后，必须用自然语言确认你做了什么。例如"好的，我已经在画布中间画了一个红色的圆形"。
3. 当用户使用代词（"它"、"刚才那个"）或模糊描述（"再大点"、"挪边上"），结合画布上下文推断意图。
4. 缺少参数时用合理默认值，不要反问。"画个圆"→ 画布中心、中等大小、无填充、黑色边框。
5. 颜色映射：太阳=红色，天空=蓝色，草地=绿色。
6. 用户说"看看"、"有什么"→ 调用 describe_canvas 描述画布内容。
7. 不确定时，温和地请用户再说一次。"没太听清，你能再说一次吗？"

【颜色规则】
- 默认填充颜色为"无"（透明），只显示边框
- 用户说"画个圆"→ color='无', stroke_color='黑'
- 用户说"画个红色的圆"→ color='红'
- 用户说"画个空心圆"→ color='无', stroke_color='黑'
- 用户说"画个实心红圆"→ color='红', stroke_color='红'

【坐标系统】
画布使用比例坐标，范围 0-1：
- x: 0=左边缘, 0.25=左1/4, 0.5=正中间, 0.75=右1/4, 1=右边缘
- y: 0=上边缘, 0.25=上1/4, 0.5=正中间, 0.75=下1/4, 1=下边缘
- draw_shape 的 x,y 参数传 0-1 的小数，如 x=0.3, y=0.7 表示左边30%、下方70%处
- 也可以用 position 名称：left_top/top/right_top/left/center/right/left_bottom/bottom/right_bottom
- 用户说"左上角"→position=left_top，说"中间偏右"→x=0.65,y=0.5
- 编辑/移动时同理，move_shape 也支持 x,y"""

_client: AsyncOpenAI = None
_tools: list = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url=settings.DEEPSEEK_BASE_URL)
        logger.info(f"[LLM] 客户端初始化: model={settings.LLM_MODEL}")
    return _client


def _get_tools() -> list:
    global _tools
    if _tools is None:
        _tools = ToolRegistry.get_openai_tools()
        logger.info(f"[LLM] 已注册 {len(_tools)} 个工具")
    return _tools


async def chat(text: str, canvas_context: Optional[str] = None, is_proactive: bool = False) -> Dict[str, Any]:
    """LLM 对话，返回 {"reply": "...", "actions": [...]}"""
    client = _get_client()
    tools = _get_tools()

    if is_proactive:
        system = SYSTEM_PROMPT + "\n\n用户已沉默一段时间。用一句温暖的话引导用户继续创作，不要催促，不调用工具。"
        messages = [{"role": "system", "content": system}, {"role": "user", "content": "（用户沉默中）"}]
        openai_tools = []
    else:
        system = SYSTEM_PROMPT
        if canvas_context:
            system += f"\n\n【画布状态】\n{canvas_context}"
        messages = [{"role": "system", "content": system}, {"role": "user", "content": text}]
        openai_tools = tools

    logger.info(f"[LLM] 调用: '{text[:50]}' tools={len(openai_tools)} proactive={is_proactive}")

    try:
        t0 = asyncio.get_event_loop().time()
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                tools=openai_tools if openai_tools else None,
                tool_choice="auto" if openai_tools else None,
                max_tokens=300,
            ),
            timeout=settings.LLM_TIMEOUT,
        )
        elapsed = asyncio.get_event_loop().time() - t0
    except asyncio.TimeoutError:
        logger.warning(f"[LLM] 超时 ({settings.LLM_TIMEOUT}s)，降级本地解析")
        return _local_fallback(text)
    except Exception as e:
        logger.error(f"[LLM] 调用失败: {type(e).__name__}: {e}")
        raise LLMError(f"LLM 调用失败: {e}")

    message = response.choices[0].message
    actions = []

    # 处理工具调用
    if message.tool_calls:
        messages.append(message.model_dump())
        for tc in message.tool_calls:
            tool_name = tc.function.name
            try:
                tool_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                tool_args = {}

            logger.info(f"[LLM] 工具调用: {tool_name}({tool_args})")
            result = ToolRegistry.execute(tool_name, tool_args)
            logger.debug(f"[LLM] 工具结果: {result}")
            actions.append({"tool": tool_name, "params": tool_args})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

        try:
            second = await asyncio.wait_for(
                client.chat.completions.create(model=settings.LLM_MODEL, messages=messages),
                timeout=settings.LLM_TIMEOUT,
            )
            reply = second.choices[0].message.content or "已完成操作"
        except Exception as e:
            logger.error(f"[LLM] 二次调用失败: {e}")
            reply = "已完成操作"
    else:
        reply = message.content or "收到指令"

    reply = reply.strip()
    logger.info(f"[LLM] 回复 ({elapsed:.1f}s): '{reply}' actions={len(actions)}")
    return {"reply": reply, "actions": actions}


def _local_fallback(text: str) -> Dict[str, Any]:
    """LLM 超时降级"""
    from ..schemas.canvas import SHAPE_MAP
    for cn, en in SHAPE_MAP.items():
        if cn in text:
            logger.info(f"[LLM] 降级匹配: {cn} -> {en}")
            return {"reply": f"好的，画一个{en}", "actions": [{"tool": "draw_shape", "params": {"shape_type": en}}]}
    return {"reply": "抱歉，没听清，再说一次？", "actions": []}
