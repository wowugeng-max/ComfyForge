# backend/core/services/model_syncer.py
from sqlalchemy.orm import Session
from datetime import datetime
from backend.models.model_config import ModelConfig
from backend.models.provider import Provider
from backend.models.api_key import APIKey
from backend.core.registry import ProviderRegistry

# 🌟 预热激活区
import backend.core.services.syncers.gemini_syncer
import backend.core.services.syncers.universal_syncer  # 🌟 引入万能同步器


class ModelSyncer:
    @classmethod
    async def sync_provider(cls, db: Session, provider_id: str, key_id: int) -> int:

        # 1. 查出 Provider 和 API Key 的配置信息
        provider_info = db.query(Provider).filter(Provider.id == provider_id).first()
        api_key_info = db.query(APIKey).filter(APIKey.id == key_id).first()

        if not provider_info or not api_key_info:
            raise ValueError("Provider 或 API Key 不存在")

        # 动态计算最终的 base_url (API Key 自定义优先)
        base_url = api_key_info.base_url or provider_info.default_base_url

        # 2. 动态获取 Syncer (极其严谨的容错机制)
        syncer = None  # 🌟 必须在这里初始化，防止 UnboundLocalError

        try:
            # 先看注册表里有没有专属的 (比如 gemini)
            syncer = ProviderRegistry.get_syncer(provider_id)
        except ValueError:
            pass  # 找不到专属的静默拦截

        # 如果没有专属的，且该提供商的 api_format 是 openai_compatible，就派万能同步器上场！
        if syncer is None and provider_info.api_format == "openai_compatible":
            try:
                syncer = ProviderRegistry.get_syncer("universal_openai")
            except ValueError:
                pass

        if syncer is None:
            raise ValueError(f"系统未找到适用于 [{provider_id}] 的同步器，请检查配置")

        # 3. 抓取远程模型列表 (兼容参数传递)
        try:
            remote_models = await syncer.fetch_remote_models(api_key_info.key, base_url=base_url)
        except TypeError:
            # 兼容旧的无需 base_url 的定制 syncer
            remote_models = await syncer.fetch_remote_models(api_key_info.key)

        if not remote_models:
            return 0

        # 4. 软删除机制：先把这个 Key 下的所有模型标记为未激活
        db.query(ModelConfig).filter(
            ModelConfig.api_key_id == key_id,
            ModelConfig.is_manual == False
        ).update({"is_active": False})

        count = 0
        for rm in remote_models:
            m_id = rm["id"]
            # 推断能力和 UI 参数
            caps = syncer.infer_capabilities(m_id)
            ui_params = syncer.get_context_ui_params(caps)

            # 5. 查找该 Key 是否已经有这个模型的记录
            db_model = db.query(ModelConfig).filter(
                ModelConfig.api_key_id == key_id,
                ModelConfig.model_name == m_id
            ).first()

            if not db_model:

                clean_display_name = rm.get("display_name", m_id).replace("models/", "")
                # 插入全新的模型记录
                db_model = ModelConfig(
                    provider=provider_id,
                    model_name=m_id,
                    display_name=clean_display_name,
                    api_key_id=key_id,
                    capabilities=caps,
                    context_ui_params=ui_params,
                    is_active=True,
                    last_synced=datetime.utcnow()
                )
                db.add(db_model)
                count += 1
            else:
                # 更新老模型的数据，并重新激活
                db_model.is_active = True
                db_model.capabilities = caps
                # 🌟 修复：只重新激活，不再用默认规则覆盖用户的自定义 capabilities 和 ui_params！
                #db_model.context_ui_params = ui_params
                #db_model.last_synced = datetime.utcnow()

        # 提交事务
        db.commit()
        return count