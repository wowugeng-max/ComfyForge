from sqlalchemy import Column, Integer, String, DateTime, Index
from datetime import datetime
from . import Base

class NodeParameterStat(Base):
    __tablename__ = 'node_parameter_stats'

    id = Column(Integer, primary_key=True)
    class_type = Column(String(200), nullable=False)   # 节点类型，如 "CLIPTextEncode"
    field = Column(String(100), nullable=False)        # 字段名，如 "text"
    count = Column(Integer, default=0)                  # 被配置为参数的次数
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_class_field', 'class_type', 'field', unique=True),
    )