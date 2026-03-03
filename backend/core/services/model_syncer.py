# backend/core/services/model_syncer.py
from sqlalchemy.orm import Session
from datetime import datetime
from backend.models.model_config import ModelConfig
from .syncers.gemini_syncer import GeminiSyncer


# 如果未来有其他平台的 Syncer，在这里导入即可

class ModelSyncer:
    # 核心修复点：这里就是缺失的插件注册表 SYNCER_MAP
    SYNCER_MAP = {
        "Gemini": GeminiSyncer,
        # "OpenAI": OpenAISyncer, # 后续扩展可以直接加在这里
    }

    @classmethod
    async def sync_provider(cls, db: Session, provider: str, api_key: str, key_id: int) -> int:
        # 获取对应平台的同步器
        syncer_cls = cls.SYNCER_MAP.get(provider)
        if not syncer_cls:
            raise ValueError(f"暂不支持该供应商的自动同步: {provider}")

        syncer = syncer_cls()

        # 抓取远程模型列表
        remote_models = await syncer.fetch_remote_models(api_key)

        # 1. 软删除机制：先把这个 Key 下的所有模型标记为未激活 (防止有些模型被官方下架)
        # 🌟 核心修改：只把“非手动（同步来）”的模型标记为失效，保护手动模型！
        db.query(ModelConfig).filter(
            ModelConfig.api_key_id == key_id,
            ModelConfig.is_manual == False  # 加了这一个过滤条件
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
                    api_key_id=key_id,  # 严格绑定 Key
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