"""
Agent 包 — ReAct 循环引擎 (三器分离)

planner.py  — 思考器：构建prompt、调用LLM、解析工具决策
executor.py — 执行器：别名解析、参数规范化、工具执行
react.py    — 协调器：编排 Think→Act→Observe→Reflect 循环
"""

from .react import agent as react_agent  # noqa: F401
