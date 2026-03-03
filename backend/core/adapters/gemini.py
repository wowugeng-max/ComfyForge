import google.generativeai as genai
from typing import List, Dict, Any

class GeminiAdapter:
    def __init__(self, api_key: str):
        self.api_key = api_key
        genai.configure(api_key=self.api_key)

    async def list_available_models(self) -> List[Dict[str, Any]]:
        """
        调用 Google API 获取当前 Key 可用的模型列表
        """
        try:
            # list_models 是同步调用，在异步环境中建议使用 run_in_executor 或直接执行
            models = genai.list_models()
            result = []
            for m in models:
                # 过滤掉过旧的模型，只保留 gemini 系列
                if "gemini" in m.name.lower():
                    result.append({
                        "id": m.name.replace("models/", ""),
                        "display_name": m.display_name,
                        "description": m.description
                    })
            return result
        except Exception as e:
            print(f"Gemini list_models failed: {e}")
            return []