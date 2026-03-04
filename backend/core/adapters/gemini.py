# backend/core/adapters/gemini.py
from google import genai
from google.genai import types  # 确保引入了 types
from .base import BaseAdapter
from typing import Dict, Any, Optional
from backend.core.registry import ProviderRegistry

@ProviderRegistry.register_adapter("gemini")
class GeminiAdapter(BaseAdapter):
    async def generate(
            self,
            api_key: str,
            model_name: str,
            prompt: str,
            type: str,
            extra_params: Dict[str, Any],
            base_url: Optional[str] = None  # 🌟 接收前端和数据库传来的 URL
    ) -> Dict[str, Any]:

        # 🌟 动态拼装 Client 参数
        client_kwargs = {"api_key": api_key}
        if base_url:
            # 如果配置了中转站，覆盖官方的默认地址
            client_kwargs["http_options"] = {"base_url": base_url}

        client = genai.Client(**client_kwargs)
        temperature = extra_params.get("temperature", 0.7)

        try:
            # 根据最新 SDK 调用模型
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                )
            )
            return {"type": "text", "content": response.text}
        except Exception as e:
            raise RuntimeError(f"Gemini API 调用失败: {str(e)}")