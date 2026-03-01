# core/adapters/factory.py
import importlib
import pkgutil
import inspect
from .base import BaseAdapter

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
    def get_adapter(cls, provider: str, db_session=None):
        """获取适配器实例，自动从数据库选择最佳Key并注入"""
        if not cls._adapters:
            cls._discover_adapters()
        adapter_class = cls._adapters.get(provider)
        if not adapter_class:
            raise ValueError(f"Unsupported provider: {provider}")

        adapter = adapter_class()

        # 尝试从数据库获取可用Key
        try:
            from backend.models.api_key import APIKey
            from sqlalchemy.orm import Session
            if db_session is None:
                # 如果没有传入session，创建一个临时会话（注意需自行关闭）
                from backend.db import SessionLocal
                db = SessionLocal()
                close_db = True
            else:
                db = db_session
                close_db = False

            key_obj = db.query(APIKey).filter(
                APIKey.provider == provider,
                APIKey.is_active == True,
                APIKey.quota_remaining > 0
            ).order_by(APIKey.priority.asc(), APIKey.quota_remaining.desc()).first()

            if key_obj:
                adapter.set_api_key(key_obj.key)
                # 更新使用计数
                key_obj.success_count += 1
                key_obj.last_used = datetime.utcnow()
                db.commit()
            if close_db:
                db.close()
        except Exception as e:
            # 如果数据库不可用或无Key，忽略，适配器将使用手动传入的Key
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