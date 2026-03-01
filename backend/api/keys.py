# backend/api/keys.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, validator
from datetime import datetime

from ..db import SessionLocal
from ..models.api_key import APIKey
from ..core.key_tester import test_key

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

    # Validators to convert None to appropriate default values
    @validator('quota_remaining', pre=True, always=True)
    def validate_quota_remaining(cls, v):
        return v if v is not None else 0

    @validator('success_count', pre=True, always=True)
    def validate_success_count(cls, v):
        return v if v is not None else 0

    @validator('failure_count', pre=True, always=True)
    def validate_failure_count(cls, v):
        return v if v is not None else 0

    @validator('avg_latency', pre=True, always=True)
    def validate_avg_latency(cls, v):
        return v if v is not None else 0.0

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
        raise HTTPException(status_code=404, detail="Key not found")
    return key

# 更新Key
@router.put("/{key_id}", response_model=APIKeyOut)
def update_key(key_id: int, update: APIKeyUpdate, db: Session = Depends(get_db)):
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
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
        raise HTTPException(status_code=404, detail="Key not found")
    db.delete(key)
    db.commit()
    return

# 测试Key有效性
@router.post("/{key_id}/test")
def test_key_endpoint(key_id: int, db: Session = Depends(get_db)):
    """测试指定Key的有效性，并更新其状态和额度"""
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    result = test_key(key.provider, key.key)
    if result["valid"]:
        key.is_active = True
        key.failure_count = 0
        if result.get("quota_remaining") is not None:
            key.quota_remaining = result["quota_remaining"]
        key.last_checked = datetime.utcnow()
        db.commit()
        return {"valid": True, "quota_remaining": key.quota_remaining, "message": result.get("message", "Key is valid")}
    else:
        key.failure_count += 1
        if key.failure_count >= 3:
            key.is_active = False
        key.last_checked = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail=result.get("message", "Key is invalid"))

# 测试所有活跃Key（用于批量检查）
@router.post("/test-all")
def test_all_keys(db: Session = Depends(get_db)):
    """测试所有活跃Key，并更新状态（可由定时任务调用）"""
    keys = db.query(APIKey).filter(APIKey.is_active == True).all()
    results = []
    for key in keys:
        result = test_key(key.provider, key.key)
        if result["valid"]:
            key.is_active = True
            key.failure_count = 0
            if result.get("quota_remaining") is not None:
                key.quota_remaining = result["quota_remaining"]
        else:
            key.failure_count += 1
            if key.failure_count >= 3:
                key.is_active = False
        key.last_checked = datetime.utcnow()
        results.append({"id": key.id, "valid": result["valid"], "message": result.get("message")})
    db.commit()
    return results