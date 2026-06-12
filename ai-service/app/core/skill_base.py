"""
技能基类模块
Skill 是对 Tool 的高级封装，包含特定的 Prompt 策略和上下文处理逻辑
"""

from abc import ABC, abstractmethod
from typing import List, Any


class BaseSkill(ABC):
    """
    技能基类

    所有技能必须继承此类并实现：
    - get_prompt(): 返回该技能专属的 System Prompt 片段
    - get_tools(): 返回该技能需要的工具列表

    使用示例：
        class DrawSkill(BaseSkill):
            def get_prompt(self) -> str:
                return "你现在是绘图模式..."

            def get_tools(self) -> list:
                return [draw_shape, edit_shape]
    """

    @abstractmethod
    def get_prompt(self) -> str:
        """
        返回该技能专属的 System Prompt 片段

        Returns:
            Prompt 字符串
        """
        pass

    @abstractmethod
    def get_tools(self) -> List[Any]:
        """
        返回该技能需要的工具列表

        Returns:
            工具列表
        """
        pass

    def get_name(self) -> str:
        """
        获取技能名称（默认使用类名）

        Returns:
            技能名称
        """
        return self.__class__.__name__
