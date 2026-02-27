# backend/models/asset.py
from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey, Text, Index
from datetime import datetime
from . import Base  # 从 __init__ 导入共享 Base


class Asset(Base):
    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True)
    type = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    tags = Column(JSON, default=list)
    data = Column(JSON, nullable=False)
    thumbnail = Column(String(500), nullable=True)
    version = Column(Integer, default=1)
    parent_id = Column(Integer, ForeignKey('assets.id'), nullable=True)
    source_asset_ids = Column(JSON, default=list)
    file_path = Column(String(500), nullable=True)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=True)  # 外键指向 projects
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_asset_type', 'type'),
        Index('idx_asset_parent', 'parent_id'),
    )