# backend/core/registry.py

class ProviderRegistry:
    _adapters = {}
    _syncers = {}

    @classmethod
    def register_adapter(cls, provider_id: str):
        """适配器注册装饰器"""
        def wrapper(adapter_class):
            cls._adapters[provider_id.lower()] = adapter_class
            return adapter_class
        return wrapper

    @classmethod
    def register_syncer(cls, provider_id: str):
        """同步器注册装饰器"""
        def wrapper(syncer_class):
            cls._syncers[provider_id.lower()] = syncer_class
            return syncer_class
        return wrapper

    @classmethod
    def get_adapter(cls, provider_id: str):
        provider_lower = provider_id.lower() if provider_id else ""
        adapter_cls = cls._adapters.get(provider_lower)
        if not adapter_cls:
            raise ValueError(f"暂不支持该供应商的生成调用: {provider_id}")
        return adapter_cls

    @classmethod
    def get_syncer(cls, provider_id: str):
        provider_lower = provider_id.lower() if provider_id else ""
        syncer_cls = cls._syncers.get(provider_lower)
        if not syncer_cls:
            raise ValueError(f"暂不支持该供应商的自动同步: {provider_id}")
        return syncer_cls()