# backend/core/services/syncers/base.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any

class BaseSyncer(ABC):
    @abstractmethod
    async def fetch_remote_models(self, api_key: str) -> List[Dict[str, Any]]:
        """从官方 API 抓取原始模型列表，返回格式: [{'id': 'xxx', 'display_name': 'xxx'}]"""
        pass

    @abstractmethod
    def infer_capabilities(self, model_id: str) -> Dict[str, bool]:
        """根据模型 ID 推断其能力矩阵 (chat, vision, image, video)"""
        pass

    @abstractmethod
    def get_context_ui_params(self, caps: Dict[str, bool]) -> Dict[str, Any]:
        """根据能力矩阵分配预设的 UI 控件参数定义"""
        pass