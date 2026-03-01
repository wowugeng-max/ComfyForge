# core/adapters/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from ..utils import get_model_capability, ModelCapability

class BaseAdapter(ABC):
    def __init__(self):
        self.api_key = None

    def set_api_key(self, api_key: str):
        """设置API Key（用于从数据库自动注入）"""
        self.api_key = api_key

    def get_capability(self, model_name: str, provider: str = "") -> ModelCapability:
        """获取模型能力，子类可覆盖以定制规则"""
        return get_model_capability(model_name, provider)

    @abstractmethod
    def call(self, ai_config: Dict[str, Any], system_prompt: Optional[str],
             parts: List[Dict[str, Any]], temperature: float, seed: int) -> Dict[str, Any]:
        """
        调用模型 API
        :param ai_config: 包含 provider, api_key, model_name, custom_base_url, extra_params 等
        :param system_prompt: 系统提示词
        :param parts: 多模态输入列表，每个元素为 {"type": "text"/"image", "data": ...}
        :param temperature: 温度
        :param seed: 随机种子（部分平台支持）
        :return: 字典 {"type": "text"/"image"/"audio", "content": ...}
        """
        pass