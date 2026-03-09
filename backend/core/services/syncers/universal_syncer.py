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
        """
                🌟 核心跃迁：基于全网主流大模型命名特征的智能分类引擎
                匹配全新的 6 大 Task Type 架构。无法识别的（如 ep-）兜底为 chat。
                """
        caps = {
            "chat": False,
            "vision": False,
            "text_to_image": False,
            "image_to_image": False,
            "text_to_video": False,
            "image_to_video": False
        }
        m = model_id.lower()
        # 1. 视频类判定 (图生视频 / 文生视频)
        if any(k in m for k in ["i2v", "image-to-video", "img2vid"]):
            caps["image_to_video"] = True
        elif any(k in m for k in
                 ["sora", "kling", "runway", "veo", "cogvideo", "vid", "t2v", "text-to-video", "wanx-video", "wan2"]):
            caps["text_to_video"] = True

        # 2. 图像类判定 (图生图 / 文生图)
        elif any(k in m for k in ["i2i", "img2img", "cosplay", "background"]):
            caps["image_to_image"] = True
        elif any(k in m for k in
                 ["dall-e", "midjourney", "mj-", "stable-diffusion", "sdxl", "cogview", "wanx-v1", "z-image", "draw",
                  "t2i", "image"]):
            caps["text_to_image"] = True

        # 3. 多模态理解判定 (同时开启 chat 和 vision)
        elif any(k in m for k in ["vision", "vl", "gpt-4o", "claude-3-5", "claude-3-opus", "gemini-1.5", "pixtral"]):
            caps["chat"] = True
            caps["vision"] = True

        # 4. 纯文本兜底 (包含 火山引擎 ep-, doubao, deepseek 等未匹配的盲盒)
        else:
            caps["chat"] = True
        return caps

    def get_context_ui_params(self, capabilities: dict) -> dict:
        """为前端提供默认的高级参数面板 Schema"""
        return {
            "temperature": {"type": "slider", "min": 0.0, "max": 2.0, "step": 0.1, "default": 0.7},
            "max_tokens": {"type": "number", "default": 2048}
        }