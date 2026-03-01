from .base import BaseAdapter
from ..utils import api_session, extract_all_text
from .factory import AdapterFactory

@AdapterFactory.register("Grok")
class GrokAdapter(BaseAdapter):
    provider_name = "Grok"  # 也可用于自动发现

    def call(self, ai_config, system_prompt, parts, temperature, seed):
        # 优先使用通过 set_api_key 注入的 Key，否则使用 ai_config 中的
        api_key = self.api_key or ai_config.get("api_key")
        if not api_key:
            raise ValueError("No API Key provided for Grok")
        model_name = ai_config["model_name"]
        extra_params = ai_config.get("extra_params", {})
        base_url = ai_config.get("custom_base_url") or "https://api.x.ai/v1/chat/completions"

        all_text = extract_all_text(parts)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": all_text})

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            **extra_params
        }

        resp = api_session.post(base_url, json=payload, headers=headers, timeout=120)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return {"type": "text", "content": content}