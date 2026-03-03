# backend/core/adapters/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseAdapter(ABC):
    @abstractmethod
    async def generate(self, api_key: str, model_name: str, prompt: str, type: str, extra_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        统一的模型调用接口
        返回格式: {"type": "text"|"image"|"video", "content": "生成的内容或base64"}
        """
        pass