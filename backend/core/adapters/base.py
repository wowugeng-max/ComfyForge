# backend/core/adapters/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseAdapter(ABC):
    @abstractmethod
    async def generate(
        self,
        api_key: str,
        model_name: str,
        prompt: str,
        type: str,
        extra_params: Dict[str, Any],
        base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        统一的模型调用接口
        返回格式: {"type": "text"|"image"|"video", "content": "生成的内容或base64"}
        """
        pass

    # 🌟 核心新增：中断接口规范
    async def interrupt(self) -> bool:
        """
        尝试物理级中断当前正在运行的任务。
        默认返回 False，具体的引擎适配器需重写此方法。
        """
        return False