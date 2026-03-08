# backend/core/adapters/factory.py
from backend.core.registry import ProviderRegistry
from backend.models.provider import Provider
from sqlalchemy.orm import Session

# 确保引入了万能代理以触发其 @ProviderRegistry.register_adapter 装饰器
import backend.core.adapters.universal_proxy


class AdapterFactory:
    @classmethod
    def get_adapter(cls, provider_id: str, db: Session):
        try:
            # 尝试获取专属类
            return ProviderRegistry.get_adapter(provider_id)
        except ValueError:
            # 回退到万能类
            provider_info = db.query(Provider).filter(Provider.id == provider_id).first()
            if provider_info and provider_info.api_format == "openai_compatible":
                return ProviderRegistry.get_adapter("universal_openai")

            raise ValueError(f"无法为供应商 [{provider_id}] 找到合适的适配器")