# backend/core/services/syncers/universal_syncer.py
import httpx
from .base import BaseSyncer
from backend.core.registry import ProviderRegistry


@ProviderRegistry.register_syncer("universal_openai")
class UniversalOpenAISyncer(BaseSyncer):
    """
    万能模型同步器
    只要提供商是 openai_compatible，就统一去 /v1/models 拉取模型列表！
    """

    async def fetch_remote_models(self, api_key: str, base_url: str = None) -> list:
        if not base_url:
            print("[UniversalSyncer] 错误: 需要 base_url 才能拉取模型")
            return []

        # 智能拼接 endpoint：防止 base_url 自带 /v1 或末尾带斜杠
        base_url = base_url.rstrip("/")
        endpoint = f"{base_url}/models" if base_url.endswith("/v1") else f"{base_url}/v1/models"

        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(endpoint, headers=headers)
                response.raise_for_status()
                data = response.json()

                # OpenAI 标准格式返回的模型列表在 'data' 字段里
                models = data.get("data", [])
                return [{"id": m["id"], "display_name": m.get("id")} for m in models]
            except Exception as e:
                print(f"[UniversalSyncer] 拉取模型失败 ({endpoint}): {e}")
                return []

    def infer_capabilities(self, model_id: str) -> dict:
        """基于模型名称的简单正则推断能力"""
        caps = {"chat": True, "vision": False, "image": False, "video": False}
        model_id_lower = model_id.lower()
        # 如果模型名字里带 vision 或者 vl，就开启视觉识图能力
        if "vision" in model_id_lower or "vl" in model_id_lower:
            caps["vision"] = True
        return caps

    def get_context_ui_params(self, capabilities: dict) -> dict:
        """为前端提供默认的高级参数面板 Schema"""
        return {
            "temperature": {"type": "slider", "min": 0.0, "max": 2.0, "step": 0.1, "default": 0.7},
            "max_tokens": {"type": "number", "default": 2048}
        }