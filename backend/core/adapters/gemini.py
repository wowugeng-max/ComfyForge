# backend/core/adapters/gemini.py
from google import genai
from .base import BaseAdapter
from typing import Dict, Any


class GeminiAdapter(BaseAdapter):
    async def generate(self, api_key: str, model_name: str, prompt: str, type: str, extra_params: Dict[str, Any]) -> \
    Dict[str, Any]:
        client = genai.Client(api_key=api_key)
        temperature = extra_params.get("temperature", 0.7)

        try:
            # 根据最新 SDK 调用模型
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=temperature,
                )
            )
            # 目前默认处理文本，后续可根据 type 参数扩展图像/视频解析逻辑
            return {"type": "text", "content": response.text}
        except Exception as e:
            raise RuntimeError(f"Gemini API 调用失败: {str(e)}")