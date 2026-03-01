# core/adapters/factory.py
import importlib
import pkgutil
import inspect
from .base import BaseAdapter


class AdapterFactory:
    _adapters = {}  # provider -> adapter_class

    @classmethod
    def register(cls, provider):
        """装饰器：注册适配器类"""

        def wrapper(adapter_class):
            if not issubclass(adapter_class, BaseAdapter):
                raise TypeError(f"{adapter_class} must inherit from BaseAdapter")
            cls._adapters[provider] = adapter_class
            return adapter_class

        return wrapper

    @classmethod
    def get_adapter(cls, provider: str):
        if not cls._adapters:
            cls._discover_adapters()
        adapter_class = cls._adapters.get(provider)
        if not adapter_class:
            raise ValueError(f"Unsupported provider: {provider}")

        # 创建adapter实例
        adapter = adapter_class()

        # 尝试从数据库获取可用的Key（如果配置了）
        try:
            # 延迟导入，避免循环依赖
            from backend.models.api_key import APIKey
            from backend.db import SessionLocal
            from datetime import datetime

            db = SessionLocal()
            try:
                key_obj = db.query(APIKey).filter(
                    APIKey.provider == provider,
                    APIKey.is_active == True
                ).order_by(APIKey.priority).first()

                if key_obj and key_obj.quota_remaining > 0:
                    # 将Key注入adapter（需要在BaseAdapter中添加set_api_key方法）
                    if hasattr(adapter, 'set_api_key'):
                        adapter.set_api_key(key_obj.key)
                    # 更新使用记录
                    key_obj.last_used = datetime.utcnow()
                    key_obj.success_count += 1
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            # 如果数据库未准备好或没有Key，静默失败，adapter将继续使用手动传入的Key
            print(f"Note: No database Key found for {provider}, using manual Key if provided")

        return adapter

    @classmethod
    def _discover_adapters(cls):
        """自动扫描 adapters 包下的所有模块，收集被 @register 装饰的类"""
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