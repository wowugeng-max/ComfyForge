# core/adapters/factory.py
import importlib
import pkgutil
import inspect
from .base import BaseAdapter
from backend.core.router import KeyRouter, RoutingStrategy  # 新增导入
from datetime import datetime

class AdapterFactory:
    _adapters = {}  # provider -> adapter_class

    @classmethod
    def register(cls, provider):
        def wrapper(adapter_class):
            if not issubclass(adapter_class, BaseAdapter):
                raise TypeError(f"{adapter_class} must inherit from BaseAdapter")
            cls._adapters[provider] = adapter_class
            return adapter_class
        return wrapper

    @classmethod
    def get_adapter(cls, provider: str, db_session=None, strategy: str = RoutingStrategy.BALANCED):
        """获取适配器实例，通过路由引擎选择最佳 Key 并注入"""
        if not cls._adapters:
            cls._discover_adapters()
        adapter_class = cls._adapters.get(provider)
        if not adapter_class:
            raise ValueError(f"Unsupported provider: {provider}")

        adapter = adapter_class()
        adapter.key_id = None  # 初始化 key_id

        # 路由选择 Key
        try:
            if db_session is None:
                from backend.db import SessionLocal
                db = SessionLocal()
                close_db = True
            else:
                db = db_session
                close_db = False

            router = KeyRouter(db)
            key_obj = router.select_key(provider, strategy=strategy)

            if key_obj:
                adapter.set_api_key(key_obj.key)
                adapter.key_id = key_obj.id  # 保存 key_id 供后续记录指标
            if close_db:
                db.close()
        except Exception as e:
            print(f"Note: Could not retrieve Key from DB for {provider}: {e}")

        return adapter

    @classmethod
    def _discover_adapters(cls):
        package = importlib.import_module("..adapters", __package__)
        for _, module_name, _ in pkgutil.iter_modules(package.__path__):
            if module_name.startswith("__"):
                continue
            try:
                module = importlib.import_module(f"..adapters.{module_name}", __package__)
            except ImportError as e:
                print(f"⚠️ 跳过适配器模块 {module_name}，因为依赖缺失: {e}")
                continue
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if issubclass(obj, BaseAdapter) and obj is not BaseAdapter:
                    if hasattr(obj, "provider_name"):
                        cls._adapters[obj.provider_name] = obj