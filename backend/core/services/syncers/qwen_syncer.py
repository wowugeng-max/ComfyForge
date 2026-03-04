import httpx
from typing import List, Dict, Any
from .base import BaseSyncer
from backend.core.registry import ProviderRegistry


@ProviderRegistry.register_syncer("qwen")
class QwenSyncer(BaseSyncer):
    async def fetch_remote_models(self, api_key: str) -> List[Dict[str, Any]]:
        """
        使用异步 httpx 抓取阿里云 DashScope 的兼容模式模型列表
        """
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=15.0)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    result = []
                    for item in data:
                        model_id = item.get("id")
                        if model_id:
                            result.append({
                                "id": model_id,
                                "display_name": model_id  # 千问接口直接用 id 作为展示名
                            })
                    return result
                else:
                    print(f"Qwen Sync Failed: HTTP {resp.status_code} - {resp.text}")
                    return []
        except Exception as e:
            print(f"Qwen Sync Error: {e}")
            return []

    def infer_capabilities(self, model_id: str) -> Dict[str, bool]:
        """
        根据千问模型名称推断能力矩阵
        """
        m = model_id.lower()
        # 默认基础能力为纯文本对话
        caps = {"chat": True, "vision": False, "image": False, "video": False}

        # 识别视觉/多模态模型 (如 qwen-vl-plus, qwen-vl-max)
        if "vl" in m or "vision" in m:
            caps["vision"] = True

        # 识别语音模型 (如 qwen-audio)
        if "audio" in m:
            caps["chat"] = True

            # 识别生图模型 (如果有通过此接口返回 wanx 或 image 相关的模型)
        if "wanx" in m or "image" in m:
            caps["image"] = True
            caps["chat"] = False
            caps["vision"] = False

        return caps

    def get_context_ui_params(self, caps: Dict[str, bool]) -> Dict[str, Any]:
        """
        根据能力分配 UI 控制面板的参数
        """
        params = {}
        # 文本和视觉模型参数
        if caps["chat"] or caps["vision"]:
            standard_params = [
                {"name": "temperature", "label": "随机性 (Temp)", "type": "number", "default": 0.8, "min": 0.0,
                 "max": 2.0, "step": 0.1},
                {"name": "max_tokens", "label": "输出长度限制", "type": "number", "default": 2048, "min": 1,
                 "max": 8192, "step": 1}
            ]
            if caps["chat"]: params["chat"] = standard_params
            if caps["vision"]: params["vision"] = standard_params

        # 图像生成参数（为万相模型准备）
        if caps["image"]:
            params["image"] = [
                {"name": "size", "label": "图像尺寸", "type": "select",
                 "options": ["1024*1024", "768*1024", "1024*768"], "default": "1024*1024"},
                {"name": "n", "label": "生成数量", "type": "number", "default": 1, "min": 1, "max": 4, "step": 1}
            ]

        return params