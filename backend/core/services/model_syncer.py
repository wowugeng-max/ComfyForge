# backend/core/services/model_syncer.py
from sqlalchemy.orm import Session
from datetime import datetime
from backend.models.model_config import ModelConfig
from .syncers.gemini_syncer import GeminiSyncer


# backend/core/services/model_syncer.py
class ModelSyncer:
    @classmethod
    async def sync_provider(cls, db: Session, provider: str, api_key: str, key_id: int) -> int:
        syncer_cls = cls.SYNCER_MAP.get(provider)
        syncer = syncer_cls()
        remote_models = await syncer.fetch_remote_models(api_key)

        # 1. 先将该 Key 下所有已失效的模型标记为不可用
        db.query(ModelConfig).filter(ModelConfig.api_key_id == key_id).update({"is_active": False})

        count = 0
        for rm in remote_models:
            caps = syncer.infer_capabilities(rm["id"])
            ui_params = syncer.get_context_ui_params(caps)

            # 2. 查找该 Key 是否已拥有此模型
            db_model = db.query(ModelConfig).filter(
                ModelConfig.api_key_id == key_id,
                ModelConfig.model_name == rm["id"]
            ).first()

            if not db_model:
                db_model = ModelConfig(
                    provider=provider,
                    model_name=rm["id"],
                    display_name=rm["display_name"],
                    api_key_id=key_id,  # 绑定 Key ID
                    capabilities=caps,
                    context_ui_params=ui_params
                )
                db.add(db_model)
                count += 1
            else:
                db_model.is_active = True
                db_model.capabilities = caps
                db_model.context_ui_params = ui_params
                db_model.last_synced = datetime.utcnow()

        db.commit()
        return count