# backend/models/assets.py
from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class Asset(Base):
    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True)
    type = Column(String, nullable=False)  # 'prompt', 'character', 'image', 'video', 'lora', 'workflow'
    name = Column(String, nullable=False)  # 资产名称
    description = Column(String, default="")
    tags = Column(JSON, default=list)  # 标签列表，如 ["角色", "赛博朋克"]
    data = Column(JSON, nullable=False)  # 核心数据，结构因 type 而异
    thumbnail = Column(String, nullable=True)  # 缩略图路径或 base64
    parent_id = Column(Integer, ForeignKey('assets.id'), nullable=True)  # 版本链
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)