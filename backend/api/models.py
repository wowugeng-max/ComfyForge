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
        # 🌟 核心修复：对齐 Phase 9 新版引擎，移除冗余的明文 key_record.key 参数
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


# backend/api/models.py

# backend/api/models.py

# backend/api/models.py

@router.post("/{model_id:int}/test")
async def test_model_health(model_id: int, db: Session = Depends(get_db)):
    """对单个模型进行连通性探针测试，并更新其健康档案 (完全基于 6 大 Task Type 驱动)"""
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
        raise HTTPException(status_code=400, detail=f"数据库中未找到供应商配置")

    try:
        from ..core.adapters.factory import AdapterFactory
        adapter_class = AdapterFactory.get_adapter(db_model.provider, db)
        adapter = adapter_class(provider=provider_record, api_key=key_record)

        # 🌟 核心跃迁：完全信任能力矩阵标签，绝不瞎猜名字！
        caps = db_model.capabilities or {}

        probe_params = {
            "model": db_model.model_name
        }

        # 阿里官方 OSS 提供的标准安全测试图
        OFFICIAL_TEST_IMAGE = "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg"

        # 🚀 【关键修复】优先级翻转：从简到繁！优先测试纯文本发起的任务。
        # 很多模型同时具备图生图和文生图，优先测试文生图可以避免触发大厂严苛的 URL 校验（如防盗链、OSS跨域等）
        if caps.get("text_to_video"):
            probe_type = "text_to_video"
            probe_params.update({
                "prompt": "A simple white cloud moving slowly."
            })
        elif caps.get("image_to_video"):
            probe_type = "image_to_video"
            probe_params.update({
                "prompt": "A simple white cloud moving slowly.",
                "image_url": OFFICIAL_TEST_IMAGE
            })
        elif caps.get("text_to_image"):
            probe_type = "text_to_image"
            probe_params.update({
                "prompt": "A simple white circle on a black background, minimal design.",
                "size": "1024x1024"
            })
        elif caps.get("image_to_image"):
            probe_type = "image_to_image"
            probe_params.update({
                "prompt": "A simple white circle on a black background.",
                "size": "1024x1024",
                "image_url": OFFICIAL_TEST_IMAGE
            })
        elif caps.get("chat"):
            probe_type = "chat"
            probe_params.update({
                "prompt": "Hello! Could you please acknowledge this test message?",
                "max_tokens": 20,
                "temperature": 0.1
            })
        elif caps.get("vision"):
            probe_type = "vision"
            probe_params.update({
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Describe this image briefly."},
                            {"type": "image_url", "image_url": {"url": OFFICIAL_TEST_IMAGE}}
                        ]
                    }
                ],
                "max_tokens": 20
            })
        else:
            # 兜底：如果都没选，默认发文本测试
            probe_type = "chat"
            probe_params.update({
                "prompt": "Hello! Could you please acknowledge this test message?",
                "max_tokens": 20,
                "temperature": 0.1
            })

        # 【关键修复】确保传入代理引擎的 type 是精确的 6 大模态，而不是模糊的 "image"
        probe_params["type"] = probe_type

        # 执行端到端真实生成
        result = await adapter.generate(probe_params)

        # 🌟 恢复最严苛的成功判定
        if isinstance(result, dict) and result.get("success"):
            db_model.health_status = "healthy"
            status_msg = "测试通过：此 Key 可正常调用该模型！"
        else:
            error_msg = str(result.get("error", "")).lower()
            if "429" in error_msg or "quota" in error_msg:
                db_model.health_status = "quota_exhausted"
                status_msg = "测试失败：额度耗尽或并发超限"
            elif "403" in error_msg or "unauthorized" in error_msg or "401" in error_msg or "no permission" in error_msg:
                db_model.health_status = "unauthorized"
                status_msg = "测试失败：当前 Key 无权限使用该模型"
            else:
                db_model.health_status = "error"
                status_msg = f"调用失败 (不可用)：{result.get('error', '未知错误')}"

    except Exception as e:
        error_str = str(e).lower()
        if "429" in error_str or "quota" in error_str:
            db_model.health_status = "quota_exhausted"
            status_msg = "测试失败：额度耗尽或并发超限"
        elif "403" in error_str or "unauthorized" in error_str or "401" in error_str:
            db_model.health_status = "unauthorized"
            status_msg = "测试失败：当前 Key 无权限使用该模型"
        else:
            db_model.health_status = "error"
            status_msg = f"调用失败 (不可用)：{str(e)}"

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


# backend/api/models.py 文件末尾

class FavoriteUpdate(BaseModel):
    is_favorite: bool


@router.patch("/{model_id:int}/favorite")
def toggle_model_favorite(model_id: int, payload: FavoriteUpdate, db: Session = Depends(get_db)):
    """轻量级接口：切换模型的常用状态"""
    db_model = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="未找到该模型")

    db_model.is_favorite = payload.is_favorite
    db.commit()

    return {"status": "success", "is_favorite": db_model.is_favorite}