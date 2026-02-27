# backend/models/asset.py
from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class Asset(Base):
    __tablename__ = 'assets'

    id = Column(Integer, primary_key=True)
    type = Column(String(50), nullable=False)  # prompt, character, workflow, lora, image, video, style
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    tags = Column(JSON, default=list)  # 标签数组
    data = Column(JSON, nullable=False)  # 核心数据，结构因 type 而异
    thumbnail = Column(String(500), nullable=True)  # 缩略图URL或base64

    # 版本控制
    version = Column(Integer, default=1)
    parent_id = Column(Integer, ForeignKey('assets.id'), nullable=True)

    # 血缘关系（可选，可通过单独的表实现更复杂的关系，但先简单）
    source_asset_ids = Column(JSON, default=list)  # 生成此资产所使用的输入资产ID列表

    # 文件路径（对于 image/video/lora 等，可能存储文件路径）
    file_path = Column(String(500), nullable=True)  # 本地文件路径或URL

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 索引
    __table_args__ = (
        Index('idx_asset_type', 'type'),
        Index('idx_asset_parent', 'parent_id'),
    )