from .base import BaseAdapter
from ..utils import api_session, extract_all_text, extract_all_images, safe_process_image
from .factory import AdapterFactory

@AdapterFactory.register("Hailuo")
class HailuoAdapter(BaseAdapter):
    provider_name = "Hailuo"  # 也可用于自动发现

    def call(self, ai_config, system_prompt, parts, temperature, seed):
        # 优先使用通过 set_api_key 注入的 Key，否则使用 ai_config 中的
        api_key = self.api_key or ai_config.get("api_key")
        if not api_key:
            raise ValueError("No API Key provided for Hailuo")
        model_name = ai_config["model_name"]
        extra_params = ai_config.get("extra_params", {})
        base_url = ai_config.get("custom_base_url") or "https://api.hailuoai.com/v1/multimodal"

        all_text = extract_all_text(parts)
        images = extract_all_images(parts)
        processed_images = [safe_process_image(img) for img in images if isinstance(img, str)]

        payload = {
            "model": model_name,
            "prompt": all_text,
            "temperature": temperature,
            **extra_params
        }
        if processed_images:
            payload["image"] = processed_images[0]

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        resp = api_session.post(base_url, json=payload, headers=headers, timeout=120)
        resp.raise_for_status()
        result = resp.json()
        content = result.get("response", "")
        return {"type": "text", "content": content}