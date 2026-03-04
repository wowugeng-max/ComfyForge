# backend/core/services/syncers/gemini_syncer.py
from .base import BaseSyncer
from google import genai
from typing import List, Dict, Any
from backend.core.registry import ProviderRegistry

@ProviderRegistry.register_syncer("gemini")
class GeminiSyncer(BaseSyncer):
    async def fetch_remote_models(self, api_key: str) -> List[Dict[str, Any]]:
        """
        使用最新的 google-genai SDK 抓取模型列表
        """
        try:
            # 初始化新版 Client
            client = genai.Client(api_key=api_key)

            # 获取模型列表
            models = client.models.list()

            result = []
            for m in models:
                # 过滤掉旧版模型，只保留 gemini 系列
                if "gemini" in m.name.lower():
                    # 新版 SDK 返回的 name 通常不带 'models/' 前缀，但为了保险做一次清洗
                    clean_id = m.name.split('/')[-1]
                    result.append({
                        "id": clean_id,
                        "display_name": m.display_name or clean_id
                    })
            return result
        except Exception as e:
            print(f"Gemini Sync Error: {e}")
            return []

    def infer_capabilities(self, model_id: str) -> Dict[str, bool]:
        """
        根据模型名称推断能力矩阵 (精确识别图像和视频模型)
        """
        m = model_id.lower()
        # 默认假设是多模态对话模型
        caps = {"chat": True, "vision": True, "image": False, "video": False}

        # 识别绘图模型 (增加对 nano banana 和 image 关键词的识别)
        if "imagen" in m or "image" in m or "banana" in m:
            caps["image"] = True
            caps["chat"] = False  # 绘图模型不能用于对话
            caps["vision"] = False  # 绘图模型不能用于识图

        # 识别视频模型
        if "veo" in m or "video" in m:
            caps["video"] = True
            caps["chat"] = False
            caps["vision"] = False

        return caps

    def get_context_ui_params(self, caps: Dict[str, bool]) -> Dict[str, Any]:
        """
        分配动态 UI 参数模板，驱动 GenerateNode 渲染
        """
        params = {}
        if caps["chat"] or caps["vision"]:
            # 标准采样参数定义
            standard_params = [
                {"name": "temperature", "label": "随机性 (Temp)", "type": "number", "default": 0.7, "min": 0, "max": 2,
                 "step": 0.1},
                {"name": "max_output_tokens", "label": "输出长度限制", "type": "number", "default": 4096}
            ]
            if caps["chat"]: params["chat"] = standard_params
            if caps["vision"]: params["vision"] = standard_params

        return params