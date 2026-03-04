# backend/core/adapters/factory.py
from .gemini import GeminiAdapter

class AdapterFactory:
    _adapters = {
        "gemini": GeminiAdapter,
        # 未来添加: "OpenAI": OpenAIAdapter
    }

    @classmethod
    def get_adapter(cls, provider: str):
        # 🌟 强制转为小写，实现完全防呆
        provider_lower = provider.lower() if provider else ""
        adapter_cls = cls._adapters.get(provider_lower)
        if not adapter_cls:
            raise ValueError(f"暂不支持该供应商: {provider}")
        return adapter_cls()