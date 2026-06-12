"""
Agent API 路由
处理语音指令的 /interpret 接口
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from loguru import logger

from app.core.agent import agent_instance

router = APIRouter(prefix="/ai/v1", tags=["agent"])


class InterpretRequest(BaseModel):
    """请求模型"""
    text: str = Field(..., description="用户语音识别后的文本", min_length=1)
    canvas_context: Optional[str] = Field(
        default=None,
        description="当前画布状态的自然语言描述"
    )


class Action(BaseModel):
    """动作模型"""
    tool: str = Field(..., description="工具名称")
    params: Dict[str, Any] = Field(default_factory=dict, description="工具参数")


class InterpretResponse(BaseModel):
    """响应模型"""
    reply: str = Field(..., description="AI的语音回复文本")
    actions: List[Action] = Field(default_factory=list, description="需要执行的动作列表")


@router.post("/interpret", response_model=InterpretResponse)
async def interpret(request: InterpretRequest, http_request: Request):
    """
    处理用户语音指令

    Args:
        request: 包含用户文本和画布上下文
        http_request: HTTP请求对象（用于获取请求ID）

    Returns:
        InterpretResponse: AI回复和待执行动作
    """
    # 获取请求ID
    request_id = http_request.headers.get("X-Request-ID", "unknown")

    logger.info(f"[{request_id}] 收到指令: text='{request.text}'")
    logger.info(f"[{request_id}] 画布上下文: {request.canvas_context}")

    try:
        # 调用 Agent 处理
        result = await agent_instance.chat(
            text=request.text,
            canvas_context=request.canvas_context
        )

        # 构建响应
        response = InterpretResponse(
            reply=result["reply"],
            actions=[Action(**action) for action in result["actions"]]
        )

        logger.info(f"[{request_id}] 返回响应: reply='{response.reply}', actions_count={len(response.actions)}")
        return response

    except Exception as e:
        logger.error(f"[{request_id}] 处理指令时出错: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="处理指令时出错，请稍后重试"
        )


@router.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "service": "VoiceCanvas-AI"}
