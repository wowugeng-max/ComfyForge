# backend/core/adapters/factory.py
from backend.core.registry import ProviderRegistry
from backend.models.provider import Provider
from sqlalchemy.orm import Session

# 🌟 核心：导入所有实体适配器，触发它们的注册装饰器
import backend.core.adapters.universal_proxy
import backend.core.adapters.comfyui

class AdapterFactory:
    @classmethod
    def get_adapter(cls, provider_id: str, db: Session):
        # 1. 先从数据库获取厂商配置，这是“配置驱动”的核心！
        provider_info = db.query(Provider).filter(Provider.id == provider_id).first()

        if not provider_info:
            raise ValueError(f"数据库中未找到供应商 [{provider_id}] 的配置")

        # 🌟 2. 按 service_type 智能路由 (彻底解绑 ID)
        # 只要类型是 comfyui，无论 ID 叫什么，都走物理引擎！
        if provider_info.service_type == "comfyui":
            return ProviderRegistry.get_adapter("base_comfyui")

        # 🌟 3. LLM 类型，按 api_format 路由万能代理
        if provider_info.service_type == "llm" and provider_info.api_format == "openai_compatible":
            return ProviderRegistry.get_adapter("universal_openai")

        # 🌟 4. 兜底方案：看有没有专门为这个 ID 写的硬编码专属适配器
        try:
            return ProviderRegistry.get_adapter(provider_id)
        except ValueError:
            raise ValueError(f"无法为供应商 [{provider_id}] (类型: {provider_info.service_type}) 找到合适的算力适配器")