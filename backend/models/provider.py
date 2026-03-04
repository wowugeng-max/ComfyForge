# backend/models/provider.py
from sqlalchemy import Column, String, Boolean
from .base import Base

class Provider(Base):
    __tablename__ = "providers"

    id = Column(String, primary_key=True, index=True)  # 例如: "gemini", "local_comfyui"
    display_name = Column(String, nullable=False)      # 例如: "Google Gemini"
    service_type = Column(String, nullable=False)      # "llm" 或 "comfyui"
    default_base_url = Column(String, nullable=True)   # 官方默认地址 (选填)
    is_active = Column(Boolean, default=True)
    icon = Column(String, nullable=True)               # 预留给前端展示小图标用