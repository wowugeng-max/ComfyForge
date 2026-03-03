# backend/api/models.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

# 确保这里的路径指向 db.py 中的 get_db
from ..db import get_db
from ..models.api_key import APIKey
from ..models.model_config import ModelConfig
from ..models.schemas import ModelConfigOut
from ..core.services.model_syncer import ModelSyncer

router = APIRouter(prefix="/api/models", tags=["models"])


# backend/api/models.py
@router.get("/", response_model=List[ModelConfigOut])
def list_models(
        mode: Optional[str] = Query(None),
        key_id: Optional[int] = Query(None),  # 新增：按 Key 过滤
        db: Session = Depends(get_db)
):
    query = db.query(ModelConfig).filter(ModelConfig.is_active == True)
    if key_id:
        query = query.filter(ModelConfig.api_key_id == key_id)

    all_models = query.all()
    if mode:
        return [m for m in all_models if m.capabilities.get(mode) is True]
    return all_models


@router.post("/sync/{key_id}")
async def sync_by_key_id(key_id: int, db: Session = Depends(get_db)):
    """根据指定的 Key ID 执行同步"""
    key_record = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Key not found")

    new_count = await ModelSyncer.sync_provider(db, key_record.provider, key_record.key, key_id)
    return {"status": "success", "message": f"已为该 Key 同步 {new_count} 个模型"}