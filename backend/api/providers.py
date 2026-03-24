# backend/api/providers.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, Dict  # 🌟 1. 补上 Dict 导入
from ..db import get_db
from ..models.provider import Provider
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/api/providers", tags=["providers"])


# --- 1. 定义响应与输入模型 (解决 422 错误) ---
class ProviderBase(BaseModel):
    id: str
    display_name: str
    service_type: str = "llm"
    api_format: str = "openai_compatible"
    auth_type: str = "Bearer"
    # 🌟 修复关键点：使用 Optional 允许数据库中的 NULL 值通过校验，并给定默认空列表
    supported_modalities: Optional[List[str]] = []
    default_base_url: Optional[str] = None
    is_active: bool = True

    # 🌟 核心修复：把 Dict[str, str] 改成 Dict[str, Any]
    endpoints: Optional[Dict[str, Any]] = {}
    custom_headers: Optional[Dict[str, str]] = {}


class ProviderOut(ProviderBase):
    model_config = ConfigDict(from_attributes=True)  # 🌟 解决 500 序列化错误


# --- 2. 路由实现 (解决 405 错误) ---

@router.get("/", response_model=List[ProviderOut])
def list_providers(service_type: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Provider)
    if service_type:
        query = query.filter(Provider.service_type == service_type)
    return query.all()


@router.post("/")
def create_provider(data: ProviderBase, db: Session = Depends(get_db)):
    existing = db.query(Provider).filter(Provider.id == data.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="厂商标识 ID 已存在")
    new_provider = Provider(**data.model_dump())
    db.add(new_provider)
    db.commit()
    return {"status": "success", "message": "新厂商配置已注入"}


@router.put("/{provider_id}")
def update_provider(provider_id: str, data: ProviderBase, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="找不到该厂商")

    # 🌟 3. 核心修复：加上 exclude_unset=True，确保只更新前端传来的字段
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(provider, key, value)

    db.commit()
    return {"status": "success", "message": "配置已更新"}


@router.delete("/{provider_id}")
def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    provider = db.query(Provider).filter(Provider.id == provider_id).first()
    if provider:
        db.delete(provider)
        db.commit()
    return {"status": "success"}