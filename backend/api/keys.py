# backend/api/keys.py
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, validator
from datetime import datetime

from ..db import get_db  # 统一导入
from ..models.api_key import APIKey
from ..models.provider import Provider  # 🌟 引入供应商配置模型
from ..models.schemas import APIKeyCreate, APIKeyUpdate, APIKeyOut

from ..models.model_config import ModelConfig  # 🌟 新增：引入模型配置表

router = APIRouter(prefix="/api/keys", tags=["keys"])


# ================= 内部探测工具函数 =================
def _execute_key_test(key_record: APIKey, provider_record: Provider) -> dict:
    """万能探测逻辑：根据数据库配置动态拼装请求"""
    base_url = key_record.base_url or provider_record.default_base_url
    if not base_url:
        return {"valid": False, "message": "网关地址 (Base URL) 未配置，无法测试"}

    base_url = base_url.rstrip("/")

    # 动态组装探测 URL (OpenAI 标准通常有 /models 接口)
    test_url = f"{base_url}/models" if provider_record.api_format == "openai_compatible" else f"{base_url}"

    # 动态组装鉴权头
    headers = {"Content-Type": "application/json"}
    if key_record.key:
        auth_type = (provider_record.auth_type or "Bearer").lower()
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {key_record.key}"
        elif auth_type == "x-api-key":
            headers["x-api-key"] = key_record.key

    # 发射探针
    try:
        resp = requests.get(test_url, headers=headers, timeout=10)
        if resp.status_code == 200:
            return {"valid": True, "quota_remaining": None, "message": "测试成功：节点连接正常，API Key 有效！"}
        else:
            return {"valid": False, "message": f"测试失败 (HTTP {resp.status_code}): {resp.text}"}
    except Exception as e:
        return {"valid": False, "message": f"请求异常: {str(e)}"}


# ================= 路由接口 =================

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
        price_per_call=key.price_per_call,
        # 🌟 补上这两个新字段存入数据库
        service_type=key.service_type,
        base_url=key.base_url
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

    # exclude_unset=True 确保前端没传的字段(比如只更新描述时没传URL)，不会被覆盖为空
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
        # 🌟 修复关键：在删除 Key 之前，先一波带走所有绑定在这个 Key 下的模型！
    db.query(ModelConfig).filter(ModelConfig.api_key_id == key_id).delete()
    db.delete(key)
    db.commit()
    return


# 🌟 修复：测试Key有效性 (支持所有新厂商)
@router.post("/{key_id}/test")
def test_key_endpoint(key_id: int, db: Session = Depends(get_db)):
    """测试指定Key的有效性，并更新其状态和额度"""
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")

    provider_record = db.query(Provider).filter(Provider.id == key.provider).first()
    if not provider_record:
        raise HTTPException(status_code=400, detail=f"数据库中未找到供应商 [{key.provider}] 的配置")

    # 走动态探测逻辑
    result = _execute_key_test(key, provider_record)

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


# 🌟 修复：测试所有活跃Key（用于批量检查）
@router.post("/test-all")
def test_all_keys(db: Session = Depends(get_db)):
    """测试所有活跃Key，并更新状态（可由定时任务调用）"""
    keys = db.query(APIKey).filter(APIKey.is_active == True).all()
    results = []

    for key in keys:
        provider_record = db.query(Provider).filter(Provider.id == key.provider).first()
        if not provider_record:
            continue  # 跳过无效的供应商

        result = _execute_key_test(key, provider_record)

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