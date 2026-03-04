# backend/core/adapters/factory.py
from backend.core.registry import ProviderRegistry

# 🌟 核心：为了确保注册装饰器被执行，必须在这里或者 app.py 里 import 一下具体的类
# 这一步叫“预热激活”

import backend.core.adapters.gemini
import backend.core.adapters.comfyui
import backend.core.adapters.qwen


class AdapterFactory:
    @classmethod
    def get_adapter(cls, provider: str):
        # 直接向注册中心要人！
        return ProviderRegistry.get_adapter(provider)