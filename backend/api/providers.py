# backend/api/providers.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from ..db import get_db
from ..models.provider import Provider
from ..models.schemas import ProviderOut

router = APIRouter(prefix="/api/providers", tags=["providers"])


def seed_providers_if_empty(db: Session):
    """如果表是空的，自动注入初始数据"""
    if db.query(Provider).first() is None:
        initial_providers = [
            # --- 大模型 LLM ---
            Provider(id="gemini", display_name="Google Gemini", service_type="llm"),
            Provider(id="qwen", display_name="阿里千问 (Qwen)", service_type="llm"),
            Provider(id="doubao", display_name="字节豆包 (Doubao)", service_type="llm"),
            Provider(id="openai", display_name="OpenAI", service_type="llm"),
            Provider(id="custom_llm", display_name="自定义 / 中转站", service_type="llm"),
            # --- 算力引擎 ComfyUI ---
            Provider(id="local_comfyui", display_name="本地 / 自建节点", service_type="comfyui",
                     default_base_url="http://127.0.0.1:8188"),
            Provider(id="runninghub", display_name="RunningHub 云端", service_type="comfyui"),
            Provider(id="civitai", display_name="Civitai (C站) 云算力", service_type="comfyui"),
        ]
        db.add_all(initial_providers)
        db.commit()


@router.get("/", response_model=List[ProviderOut])
def list_providers(service_type: Optional[str] = None, db: Session = Depends(get_db)):
    """获取提供商列表，支持按类型过滤"""
    # 每次请求顺手检查一下要不要初始化种子数据（很轻量）
    seed_providers_if_empty(db)

    query = db.query(Provider).filter(Provider.is_active == True)
    if service_type:
        query = query.filter(Provider.service_type == service_type)
    return query.all()