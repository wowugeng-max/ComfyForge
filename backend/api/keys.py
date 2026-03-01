# backend/api/keys.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import SessionLocal
from ..models.api_key import APIKey

router = APIRouter(prefix="/api/keys", tags=["keys"])


# Pydantic 模型
class APIKeyBase(BaseModel):
    provider: str
    key: str
    description: Optional[str] = ""
    is_active: Optional[bool] = True
    priority: Optional[int] = 0
    tags: Optional[List[str]] = []
    quota_total: Optional[int] = 0
    quota_unit: Optional[str] = "count"
    price_per_call: Optional[float] = 0.0


class APIKeyCreate(APIKeyBase):
    pass


class APIKeyUpdate(BaseModel):
    description: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    tags: Optional[List[str]] = None


class APIKeyOut(APIKeyBase):
    id: int
    quota_remaining: int
    success_count: int
    failure_count: int
    avg_latency: float
    last_used: Optional[datetime]
    last_checked: datetime
    created_at: datetime
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


# 依赖
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 创建Key
@router.post("/", response_model=APIKeyOut)
def create_key(key: APIKeyCreate, db: Session = Depends(get_db)):
    db_key = APIKey(
        provider=key.provider,
        key=key.key,
        description=key.description,
        is_active=key.is_active,
        priority=key.priority,
        tags=key.tags,
        quota_total=key.quota_total,
        quota_remaining=key.quota_total,  # 初始剩余等于总配额
        quota_unit=key.quota_unit,
        price_per_call=key.price_per_call
    )
    db.add(db_key)
    db.commit()
    db.refresh(db_key)
    return db_key


# 列出所有Key
@router.get("/", response_model=List[APIKeyOut])
def list_keys(
        provider: Optional[str] = None,
        is_active: Optional[bool] = None,
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1),
        db: Session = Depends(get_db)
):
    query = db.query(APIKey)
    if provider:
        query = query.filter(APIKey.provider == provider)
    if is_active is not None:
        query = query.filter(APIKey.is_active == is_active)
    return query.offset(skip).limit(limit).all()


# 获取单个Key
@router.get("/{key_id}", response_model=APIKeyOut)
def get_key(key_id: int, db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(404, "Key not found")
    return key


# 更新Key
@router.put("/{key_id}", response_model=APIKeyOut)
def update_key(key_id: int, update: APIKeyUpdate, db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(404, "Key not found")

    update_data = update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(key, field, value)

    db.commit()
    db.refresh(key)
    return key


# 删除Key
@router.delete("/{key_id}", status_code=204)
def delete_key(key_id: int, db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(404, "Key not found")
    db.delete(key)
    db.commit()
    return


# 测试Key有效性
@router.post("/{key_id}/test")
def test_key(key_id: int, db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(404, "Key not found")

    # 这里调用对应provider的测试接口
    from ..core.key_tester import test_key
    result = test_key(key.provider, key.key)

    if result["valid"]:
        key.is_active = True
        key.last_checked = datetime.utcnow()
        if "quota_remaining" in result:
            key.quota_remaining = result["quota_remaining"]
        db.commit()

    return result