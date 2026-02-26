# backend/core/executors/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseExecutor(ABC):
    @abstractmethod
    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        """执行任务，返回结果"""
        pass