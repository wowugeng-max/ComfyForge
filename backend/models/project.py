# backend/models/project.py
from sqlalchemy import Column, Integer, String, DateTime, JSON
from datetime import datetime
from . import Base

class Project(Base):
    __tablename__ = 'projects'

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(String, default="")
    tags = Column(JSON, default=list)
    # 🌟 核心新增：专门存储前端 ReactFlow 的画布节点与连线状态
    # 彻底与 ComfyUI 的 "workflow" 概念隔离！
    canvas_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)