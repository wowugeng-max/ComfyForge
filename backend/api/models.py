# backend/api/models.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..db import get_db
from ..models.api_key import APIKey
from ..models.model_config import ModelConfig
from ..models.schemas import ModelConfigOut
from ..core.services.model_syncer import ModelSyncer

router = APIRouter(prefix="/api/models", tags=["models"])


# --- 定义前端提交的模型表单数据结构 ---
class ModelCreateUpdate(BaseModel):
    display_name: str
    model_name: str
    provider: Optional[str] = None
    api_key_id: Optional[int] = None
    capabilities: Dict[str, bool]
    is_manual: Optional[bool] = True
    context_ui_params: Optional[Dict[str, Any]] = {}
    is_active: Optional[bool] = True


# ================= 1. 查询与同步路由 (原有) =================

@router.get("/", response_model=List[ModelConfigOut])
def list_models(
        mode: Optional[str] = Query(None, description="能力过滤: chat, vision, image, video"),
        key_id: Optional[int] = Query(None, description="按 API Key ID 过滤模型"),
        db: Session = Depends(get_db)
):
    # 只查询激活状态的模型
    query = db.query(ModelConfig).filter(ModelConfig.is_active == True)

    # 如果传入了 key_id，则只返回该 Key 绑定的模型
    if key_id is not None:
        query = query.filter(ModelConfig.api_key_id == key_id)

    all_models = query.all()

    # 在内存中过滤多维能力矩阵
    if mode:
        return [m for m in all_models if m.capabilities and m.capabilities.get(mode) is True]

    return all_models


@router.post("/sync/{key_id}")
async def sync_by_key_id(key_id: int, db: Session = Depends(get_db)):
    """根据指定的 Key ID 执行模型同步"""
    key_record = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="未找到该 API Key，请刷新页面重试")
    if not key_record.is_active:
        raise HTTPException(status_code=400, detail="该 API Key 未启用，无法同步")

    try:
        new_count = await ModelSyncer.sync_provider(db, key_record.provider, key_record.key, key_id)
        return {"status": "success", "message": f"同步完成，为该 Key 更新了 {new_count} 个模型"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"同步服务内部错误: {str(e)}")


# ================= 2. 手动模型 CRUD 路由 (全新补齐) =================

@router.post("/")
def create_model(model_data: ModelCreateUpdate, db: Session = Depends(get_db)):
    """手动添加自定义模型 (如 Veo 或私有部署模型)"""
    # 检查绑定的 Key 是否存在
    if model_data.api_key_id:
        key_record = db.query(APIKey).filter(APIKey.id == model_data.api_key_id).first()
        if not key_record:
            raise HTTPException(status_code=404, detail="绑定的 API Key 不存在")

    # 检查是否已存在同名且同 Key 的模型
    existing = db.query(ModelConfig).filter(
        ModelConfig.api_key_id == model_data.api_key_id,
        ModelConfig.model_name == model_data.model_name
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="该 Key 下已存在相同代号的模型，请勿重复添加")

    new_model = ModelConfig(
        provider=model_data.provider,
        model_name=model_data.model_name,
        display_name=model_data.display_name,
        api_key_id=model_data.api_key_id,
        capabilities=model_data.capabilities,
        context_ui_params=model_data.context_ui_params,
        is_manual=model_data.is_manual,
        is_active=model_data.is_active,
        last_synced=datetime.utcnow()
    )
    db.add(new_model)
    db.commit()
    db.refresh(new_model)
    return {"status": "success", "message": "模型添加成功", "id": new_model.id}


@router.put("/{model_id}")
def update_model(model_id: int, model_data: ModelCreateUpdate, db: Session = Depends(get_db)):
    """更新手动添加的模型信息"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="未找到该模型")

    # 更新字段
    db_model.display_name = model_data.display_name
    db_model.model_name = model_data.model_name
    db_model.capabilities = model_data.capabilities

    db.commit()
    return {"status": "success", "message": "模型更新成功"}


@router.delete("/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    """删除模型（增加安全校验，防止误删官方同步模型）"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="未找到该模型")

    # 安全锁：严格禁止删除“官方同步”的模型
    if not db_model.is_manual:
        raise HTTPException(status_code=403, detail="官方同步的模型禁止手动删除，如果不需要请尝试禁用它")

    db.delete(db_model)
    db.commit()
    return {"status": "success", "message": "模型已删除"}