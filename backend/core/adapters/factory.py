# backend/core/adapters/factory.py
from .gemini import GeminiAdapter

class AdapterFactory:
    _adapters = {
        "Gemini": GeminiAdapter,
        # 未来添加: "OpenAI": OpenAIAdapter
    }

    @classmethod
    def get_adapter(cls, provider: str):
        adapter_cls = cls._adapters.get(provider)
        if not adapter_cls:
            raise ValueError(f"暂不支持该供应商: {provider}")
        return adapter_cls()