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
import asyncio
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

# 定义接收 JSON 的 Pydantic 模型
class UIParamsUpdate(BaseModel):
    context_ui_params: Dict[str, Any]

# ================= 批量更新 UI 参数接口 =================
class BulkUIParamsUpdate(BaseModel):
    api_key_id: int
    capability: str           # 能力大类：'chat', 'vision', 'image', 'video'
    ui_params_array: list     # 传入针对该能力的参数数组


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


@router.put("/{model_id:int}")
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


@router.delete("/{model_id:int}")
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


@router.post("/{model_id:int}/test")
async def test_model_health(model_id: int, db: Session = Depends(get_db)):
    """对单个模型进行连通性探针测试，并更新其健康档案"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型不存在")

    key_record = db.query(APIKey).filter(APIKey.id == db_model.api_key_id).first()
    if not key_record or not key_record.is_active:
        db_model.health_status = "error"
        db.commit()
        raise HTTPException(status_code=400, detail="绑定的 API Key 无效")

    try:
        from ..core.adapters.factory import AdapterFactory
        adapter = AdapterFactory.get_adapter(db_model.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        # 🌟 USE THE NEW ASYNC .generate() METHOD INSTEAD OF .call() 🌟
        # Send a minimal probe to test connection
        result = await adapter.generate(
            api_key=key_record.key,
            model_name=db_model.model_name,
            prompt="Hi",
            type="text",
            extra_params={"temperature": 0.1, "max_output_tokens": 10}
        )

        # If no exception was raised, it means we got a response successfully!
        db_model.health_status = "healthy"
        status_msg = "测试通过：模型运行健康！"

    except Exception as e:
        error_str = str(e).lower()
        print(f"Test Probe Error: {error_str}")
        # Accurately map errors
        if "429" in error_str or "quota" in error_str or "exhausted" in error_str:
            db_model.health_status = "quota_exhausted"
            status_msg = "测试失败：免费额度已耗尽，或频率受限。"
        elif "403" in error_str or "unauthorized" in error_str:
            db_model.health_status = "unauthorized"
            status_msg = "测试失败：无权限访问此模型。"
        elif "not found" in error_str or "404" in error_str:
            db_model.health_status = "error"
            status_msg = "测试失败：官方接口中不存在该模型。"
        else:
            db_model.health_status = "error"
            status_msg = f"测试失败：{str(e)}"

    db_model.last_tested_at = datetime.utcnow()
    db.commit()

    return {
        "status": db_model.health_status,
        "message": status_msg,
        "last_tested_at": db_model.last_tested_at
    }


@router.put("/{model_id:int}/ui-params")
def update_model_ui_params(model_id: int, payload: UIParamsUpdate, db: Session = Depends(get_db)):
    """热更新模型的 UI 参数配置 (供高级配置模块使用)"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="未找到该模型")

    # 直接覆写 JSON 字段
    db_model.context_ui_params = payload.context_ui_params
    db.commit()

    return {"status": "success", "message": "参数配置热更新成功"}


@router.put("/bulk/ui-params")
def bulk_update_ui_params(payload: BulkUIParamsUpdate, db: Session = Depends(get_db)):
    """按能力大类 (如 image/video) 批量覆写该 Key 下所有匹配模型的参数"""
    # 查找该 Key 下的所有模型
    models = db.query(ModelConfig).filter(ModelConfig.api_key_id == payload.api_key_id).all()
    updated_count = 0

    # 引入 flag_modified 强制 SQLAlchemy 识别 JSON 字典内部的更新
    from sqlalchemy.orm.attributes import flag_modified

    for m in models:
        # 只有当该模型具备这项能力时，才给它注入这套参数
        if m.capabilities and m.capabilities.get(payload.capability):
            # 深拷贝原有配置，防止丢失其他能力的参数（比如一个模型同时有 chat 和 image）
            current_params = dict(m.context_ui_params) if m.context_ui_params else {}

            # 覆写该能力大类的参数数组
            current_params[payload.capability] = payload.ui_params_array

            m.context_ui_params = current_params
            flag_modified(m, "context_ui_params")  # 标记 JSON 字段已修改
            updated_count += 1

    db.commit()

    return {"status": "success", "message": f"成功批量覆写了 {updated_count} 个模型的 {payload.capability} 参数！"}