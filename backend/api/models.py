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
    capability: str  # 能力大类：'chat', 'vision', 'image_to_image', 'text_to_image' 等
    ui_params_array: List[Any]


@router.get("/", response_model=List[ModelConfigOut])
def get_models(db: Session = Depends(get_db)):
    return db.query(ModelConfig).all()


@router.post("/", response_model=ModelConfigOut)
def create_model(payload: ModelCreateUpdate, db: Session = Depends(get_db)):
    db_model = ModelConfig(**payload.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


@router.put("/{model_id:int}", response_model=ModelConfigOut)
def update_model(model_id: int, payload: ModelCreateUpdate, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")

    for key, value in payload.model_dump().items():
        setattr(db_model, key, value)

    db.commit()
    db.refresh(db_model)
    return db_model


@router.delete("/{model_id:int}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")
    db.delete(db_model)
    db.commit()
    return {"status": "success"}


@router.post("/{model_id:int}/sync")
async def sync_model_params(model_id: int, db: Session = Depends(get_db)):
    """从云端供应商处同步该模型的最新参数定义"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")

    key = db.query(APIKey).filter(APIKey.id == db_model.api_key_id).first()
    if not key:
        raise HTTPException(status_code=400, detail="未关联有效的 API Key")

    try:
        syncer = ModelSyncer(db_model.provider, key.key)
        params = await syncer.fetch_params(db_model.model_name)

        db_model.context_ui_params = params
        db.commit()
        return {"status": "success", "params": params}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{model_id:int}/test")
async def test_model_health(model_id: int, db: Session = Depends(get_db)):
    """对单个模型进行连通性探针测试 (完全基于 DSL 配置驱动)"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型不存在")

    key_record = db.query(APIKey).filter(APIKey.id == db_model.api_key_id).first()
    if not key_record or not key_record.is_active:
        db_model.health_status = "error"
        db.commit()
        raise HTTPException(status_code=400, detail="绑定的 API Key 无效或未启用")

    from ..models.provider import Provider
    provider_record = db.query(Provider).filter(Provider.id == db_model.provider).first()
    if not provider_record:
        raise HTTPException(status_code=400, detail=f"未找到供应商 [{db_model.provider}]")

    try:
        adapter_class = AdapterFactory.get_adapter(db_model.provider, db)
        adapter = adapter_class(provider=provider_record, api_key=key_record)

        # 1. 自动选择第一个可用的能力作为探针模态
        caps = db_model.capabilities or {}
        # 优先级：文生图 > 图生图 > 对话 > 视觉
        probe_type = "chat"
        for priority in ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "vision", "chat"]:
            if caps.get(priority):
                probe_type = priority
                break

        # 2. 🌟 核心改动：准备探针“原材料”池
        # 无论厂商如何要求 JSON 结构，我们只提供基础变量，由渲染器根据 DSL 模板自行挑选
        OFFICIAL_TEST_IMAGE = "https://img.alicdn.com/tfs/TB1p.bgQXXXXXbFXFXXXXXXXXXX-500-500.png"

        probe_params = {
            "model": db_model.model_name,
            "type": probe_type,
            "prompt": "A simple white circle on a black background, minimal design.",
            "size": "1024x1024",
        }

        # 如果需要图片输入，则加入图片变量
        if probe_type in ["image_to_image", "image_to_video", "vision"]:
            probe_params["image_url"] = OFFICIAL_TEST_IMAGE

        # 为 vision 和 chat 提供标准的 messages 数组变量，供 {{messages}} 占位符使用
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

        # 3. 执行生成 (Adapter 会处理 DSL 模板渲染)
        result = await adapter.generate(probe_params)

        if isinstance(result, dict) and result.get("success"):
            db_model.health_status = "healthy"
            status_msg = "测试通过"
        else:
            error_msg = str(result.get("error", "")).lower()
            db_model.health_status = "error"
            status_msg = f"调用失败：{result.get('error', '未知错误')}"

    except Exception as e:
        db_model.health_status = "error"
        status_msg = f"探针异常：{str(e)}"

    db_model.last_tested_at = datetime.utcnow()
    db.commit()

    return {
        "status": db_model.health_status,
        "message": status_msg,
        "last_tested_at": db_model.last_tested_at
    }


@router.patch("/{model_id:int}/params")
def update_model_ui_params(model_id: int, payload: UIParamsUpdate, db: Session = Depends(get_db)):
    """更新单个模型的 UI 参数字典"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")

    db_model.context_ui_params = payload.context_ui_params
    db.commit()
    return {"status": "success"}


@router.post("/bulk_params")
def bulk_update_ui_params(payload: BulkUIParamsUpdate, db: Session = Depends(get_db)):
    """批量覆写该 Key 下所有匹配模型的参数"""
    models = db.query(ModelConfig).filter(ModelConfig.api_key_id == payload.api_key_id).all()
    updated_count = 0

    from sqlalchemy.orm.attributes import flag_modified

    for m in models:
        if m.capabilities and m.capabilities.get(payload.capability):
            current_params = dict(m.context_ui_params) if m.context_ui_params else {}
            current_params[payload.capability] = payload.ui_params_array
            m.context_ui_params = current_params
            flag_modified(m, "context_ui_params")
            updated_count += 1

    db.commit()
    return {"status": "success", "message": f"成功批量覆写了 {updated_count} 个模型的 {payload.capability} 参数！"}


class FavoriteUpdate(BaseModel):
    is_favorite: bool


@router.patch("/{model_id:int}/favorite")
def update_favorite(model_id: int, payload: FavoriteUpdate, db: Session = Depends(get_db)):
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="模型未找到")
    db_model.is_favorite = payload.is_favorite
    db.commit()
    return {"status": "success"}