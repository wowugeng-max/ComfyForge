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
    # 🌟 核心新增：区分同步模型与手动模型
    is_manual = Column(Boolean, default=False)
    # 🌟 新增：常用模型标记
    is_favorite = Column(Boolean, default=False)
    last_synced = Column(DateTime, default=datetime.utcnow)

    # 🌟 核心新增：健康追踪系统
    # 状态枚举: 'unknown'(未知), 'healthy'(健康可用), 'quota_exhausted'(额度耗尽), 'unauthorized'(无权限/需绑卡), 'error'(其他错误)
    health_status = Column(String, default="unknown")
    last_tested_at = Column(DateTime, nullable=True)