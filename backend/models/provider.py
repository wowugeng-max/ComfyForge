# backend/models/provider.py
from sqlalchemy import Column, String, Boolean, JSON
from .base import Base


class Provider(Base):
    __tablename__ = "providers"

    id = Column(String, primary_key=True, index=True)  # 例如: "gemini", "deepseek", "local_comfyui"
    display_name = Column(String, nullable=False)  # 例如: "Google Gemini", "DeepSeek"
    service_type = Column(String, nullable=False)  # "llm" 或 "comfyui"

    # 🌟 Phase 9 核心跃迁：通用代理路由配置字段
    api_format = Column(String, nullable=False,
                        default="openai_compatible")  # 例如: openai_compatible, gemini_native, custom
    auth_type = Column(String, nullable=False, default="Bearer")  # 例如: Bearer, x-api-key, none
    supported_modalities = Column(JSON, nullable=True)  # 存储大模型支持的模态，例如: ["text", "vision", "video"]

    default_base_url = Column(String, nullable=True)  # 官方默认地址 (选填)
    is_active = Column(Boolean, default=True)
    icon = Column(String, nullable=True)  # 预留给前端展示小图标用

    # ================= 🌟 架构升级：新增高级路由与自定义头 =================
    endpoints = Column(JSON, default={}, nullable=True)  # 例如: {"chat": "/v1/chat/completions", "image": "..."}
    custom_headers = Column(JSON, default={}, nullable=True)  # 例如: {"X-DashScope-Async": "enable"}