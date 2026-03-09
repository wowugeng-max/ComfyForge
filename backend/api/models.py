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
from ..core.adapters.factory import AdapterFactory

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


class UIParamsUpdate(BaseModel):
    context_ui_params: Dict[str, Any]


class BulkUIParamsUpdate(BaseModel):
    api_key_id: int
    capability: str
    ui_params_array: List[Any]


# ================= 1. 查询与同步路由 (恢复你原有的完美逻辑) =================

@router.get("/", response_model=List[ModelConfigOut])
def list_models(
        mode: Optional[str] = Query(None, description="能力过滤: chat, vision, image, video"),
        key_id: Optional[int] = Query(None, description="按 API Key ID 过滤模型"),
        db: Session = Depends(get_db)
):
    query = db.query(ModelConfig).filter(ModelConfig.is_active == True)
    if key_id is not None:
        query = query.filter(ModelConfig.api_key_id == key_id)

    all_models = query.all()
    if mode:
        return [m for m in all_models if m.capabilities and m.capabilities.get(mode) is True]
    return all_models


@router.post("/sync/{key_id}")
async def sync_by_key_id(key_id: int, db: Session = Depends(get_db)):
    """根据指定的 Key ID 执行模型批量同步"""
    key_record = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="未找到该 API Key，请刷新页面重试")
    if not key_record.is_active:
        raise HTTPException(status_code=400, detail="该 API Key 未启用，无法同步")

    try:
        new_count = await ModelSyncer.sync_provider(
            db=db,
            provider_id=key_record.provider,
            key_id=key_id
        )
        return {"status": "success", "message": f"同步完成，为该 Key 更新了 {new_count} 个模型"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"同步服务内部错误: {str(e)}")


# ================= 2. 手动模型 CRUD 路由 =================

@router.post("/")
def create_model(model_data: ModelCreateUpdate, db: Session = Depends(get_db)):
    if model_data.api_key_id:
        key_record = db.query(APIKey).filter(APIKey.id == model_data.api_key_id).first()
        if not key_record:
            raise HTTPException(status_code=404, detail="绑定的 API Key 不存在")

    existing = db.query(ModelConfig).filter(
        ModelConfig.api_key_id == model_data.api_key_id,
        ModelConfig.model_name == model_data.model_name
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="已存在相同代号的模型，请勿重复添加")

    new_model = ModelConfig(**model_data.model_dump())
    new_model.last_synced = datetime.utcnow()
    db.add(new_model)
    db.commit()
    db.refresh(new_model)
    return {"status": "success", "id": new_model.id}


@router.put("/{model_id:int}")
def update_model(model_id: int, model_data: ModelCreateUpdate, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="未找到该模型")
    db_model.display_name = model_data.display_name
    db_model.model_name = model_data.model_name
    db_model.capabilities = model_data.capabilities
    db.commit()
    return {"status": "success"}


@router.delete("/{model_id:int}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="未找到该模型")
    if not db_model.is_manual:
        raise HTTPException(status_code=403, detail="官方同步的模型禁止手动删除")
    db.delete(db_model)
    db.commit()
    return {"status": "success"}


# ================= 3. 探针测试路由 (搭载全新 DSL 自适应引擎) =================

@router.post("/{model_id:int}/test")
async def test_model_health(model_id: int, db: Session = Depends(get_db)):
    """基于 DSL 模板驱动的连通性探针测试"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型不存在")

    key_record = db.query(APIKey).filter(APIKey.id == db_model.api_key_id).first()
    if not key_record or not key_record.is_active:
        db_model.health_status = "error"
        db.commit()
        raise HTTPException(status_code=400, detail="绑定的 API Key 无效")

    from ..models.provider import Provider
    provider_record = db.query(Provider).filter(Provider.id == db_model.provider).first()
    if not provider_record:
        raise HTTPException(status_code=400, detail="未找到供应商配置")

    try:
        adapter_class = AdapterFactory.get_adapter(db_model.provider, db)
        adapter = adapter_class(provider=provider_record, api_key=key_record)

        caps = db_model.capabilities or {}
        probe_type = "chat"
        for priority in ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "vision", "chat"]:
            if caps.get(priority):
                probe_type = priority
                break

        OFFICIAL_TEST_IMAGE = "https://img.alicdn.com/tfs/TB1p.bgQXXXXXbFXFXXXXXXXXXX-500-500.png"

        probe_params = {
            "model": db_model.model_name,
            "type": probe_type,
            "prompt": "A simple white circle on a black background.",
            "size": "1024x1024",
        }

        if probe_type in ["image_to_image", "image_to_video", "vision"]:
            probe_params["image_url"] = OFFICIAL_TEST_IMAGE

        if probe_type == "vision":
            probe_params["messages"] = [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this image."},
                    {"type": "image_url", "image_url": {"url": OFFICIAL_TEST_IMAGE}}
                ]
            }]
        else:
            probe_params["messages"] = [{"role": "user", "content": probe_params["prompt"]}]

        result = await adapter.generate(probe_params)

        if isinstance(result, dict) and result.get("success"):
            db_model.health_status = "healthy"
            status_msg = "测试通过"
        else:
            error_msg = str(result.get("error", "")).lower()
            if "429" in error_msg or "quota" in error_msg:
                db_model.health_status = "quota_exhausted"
                status_msg = "测试失败：额度耗尽"
            elif "unauthorized" in error_msg or "401" in error_msg:
                db_model.health_status = "unauthorized"
                status_msg = "测试失败：无权限"
            else:
                db_model.health_status = "error"
                status_msg = f"调用失败：{result.get('error', '未知错误')}"

    except Exception as e:
        db_model.health_status = "error"
        status_msg = f"探针异常：{str(e)}"

    db_model.last_tested_at = datetime.utcnow()
    db.commit()

    return {"status": db_model.health_status, "message": status_msg, "last_tested_at": db_model.last_tested_at}


@router.put("/{model_id:int}/ui-params")
def update_model_ui_params(model_id: int, payload: UIParamsUpdate, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")
    db_model.context_ui_params = payload.context_ui_params
    db.commit()
    return {"status": "success"}


@router.put("/bulk/ui-params")
def bulk_update_ui_params(payload: BulkUIParamsUpdate, db: Session = Depends(get_db)):
    models = db.query(ModelConfig).filter(ModelConfig.api_key_id == payload.api_key_id).all()
    from sqlalchemy.orm.attributes import flag_modified
    updated_count = 0
    for m in models:
        if m.capabilities and m.capabilities.get(payload.capability):
            current_params = dict(m.context_ui_params) if m.context_ui_params else {}
            current_params[payload.capability] = payload.ui_params_array
            m.context_ui_params = current_params
            flag_modified(m, "context_ui_params")
            updated_count += 1
    db.commit()
    return {"status": "success", "message": f"成功更新 {updated_count} 个模型"}


class FavoriteUpdate(BaseModel):
    is_favorite: bool


@router.patch("/{model_id:int}/favorite")
def toggle_model_favorite(model_id: int, payload: FavoriteUpdate, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")
    db_model.is_favorite = payload.is_favorite
    db.commit()
    return {"status": "success", "is_favorite": db_model.is_favorite}