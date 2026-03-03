from sqlalchemy import Column, Integer, String, JSON, Boolean, DateTime, ForeignKey
from datetime import datetime
from .base import Base


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, index=True)
    model_name = Column(String)  # 注意：去掉 unique=True，因为不同 Key 可能拥有同名模型
    display_name = Column(String)

    # 建立外键关联：模型属于特定的 Key
    api_key_id = Column(Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=True)

    capabilities = Column(JSON, nullable=False)
    context_ui_params = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    last_synced = Column(DateTime, default=datetime.utcnow)