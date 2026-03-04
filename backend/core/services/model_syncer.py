# backend/core/services/model_syncer.py
from sqlalchemy.orm import Session
from datetime import datetime
from backend.models.model_config import ModelConfig
from backend.core.registry import ProviderRegistry

# 🌟 预热激活 Gemini 同步器 (很重要，必须有这行，装饰器才会执行)
import backend.core.services.syncers.gemini_syncer
import backend.core.services.syncers.qwen_syncer


class ModelSyncer:
    @classmethod
    async def sync_provider(cls, db: Session, provider: str, api_key: str, key_id: int) -> int:

        # 🌟 终极修复：因为注册表返回的已经是实例了，直接拿来用！绝对不要加括号！
        syncer = ProviderRegistry.get_syncer(provider)

        # 抓取远程模型列表
        remote_models = await syncer.fetch_remote_models(api_key)

        # 1. 软删除机制：先把这个 Key 下的所有模型标记为未激活
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

            # 2. 查找该 Key 是否已经有这个模型的记录
            db_model = db.query(ModelConfig).filter(
                ModelConfig.api_key_id == key_id,
                ModelConfig.model_name == m_id
            ).first()

            if not db_model:
                # 插入全新的模型记录
                db_model = ModelConfig(
                    provider=provider,
                    model_name=m_id,
                    display_name=rm.get("display_name", m_id),
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
                db_model.context_ui_params = ui_params
                db_model.last_synced = datetime.utcnow()

        # 提交事务
        db.commit()
        return count