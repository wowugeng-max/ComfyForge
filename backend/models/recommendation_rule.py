from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from . import Base

class RecommendationRule(Base):
    __tablename__ = 'recommendation_rules'

    id = Column(Integer, primary_key=True)
    class_type = Column(String(200), nullable=False, index=True)  # 节点类型
    field = Column(String(100), nullable=False)                   # 字段名
    friendly_name = Column(String(100), nullable=False)           # 默认参数名
    auto_check = Column(Boolean, default=False)                   # 是否默认勾选
    enabled = Column(Boolean, default=True)                       # 是否启用
    priority = Column(Integer, default=0)                         # 优先级（数字越小越靠前）
    threshold = Column(Integer, default=1)                        # 最小统计次数阈值
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)