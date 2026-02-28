# backend/api/assets.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import SessionLocal
from ..models import Asset, Project
from ..models.schemas import ASSET_DATA_SCHEMAS

router = APIRouter(prefix="/api/assets", tags=["assets"])


# Pydantic 模型用于请求和响应
class AssetBase(BaseModel):
    type: str
    name: str
    description: Optional[str] = ""
    tags: List[str] = []
    data: dict
    thumbnail: Optional[str] = None
    project_id: Optional[int] = None  # 新增


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    data: Optional[dict] = None
    thumbnail: Optional[str] = None
    project_id: Optional[int] = None  # 新增

class ProjectUpdate(BaseModel):
    project_id: Optional[int] = None


class AssetOut(AssetBase):
    id: int
    version: int
    created_at: datetime
    updated_at: datetime
    parent_id: Optional[int] = None
    source_asset_ids: Optional[List[int]] = None  # 新增字段
    project_id: Optional[int] = None  # 已在基类，但明确列出

    class Config:
        from_attributes = True  # SQLAlchemy 2.0 风格，替代 orm_mode


# 依赖项：获取数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=AssetOut)
def create_asset(asset: AssetCreate, db: Session = Depends(get_db)):
    # 验证 data 字段
    schema = ASSET_DATA_SCHEMAS.get(asset.type)
    if schema:
        try:
            validated_data = schema(**asset.data).dict()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"数据格式错误: {e}")
    else:
        # 未知类型，可放行或报错，这里选择放行并记录日志
        validated_data = asset.data

    db_asset = Asset(
        type=asset.type,
        name=asset.name,
        description=asset.description,
        tags=asset.tags,
        data=validated_data,
        thumbnail=asset.thumbnail,
        project_id=asset.project_id
    )
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset


@router.get("/", response_model=List[AssetOut])
def list_assets(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    type: Optional[str] = None,
    project_id: Optional[int] = None,  # 新增
    db: Session = Depends(get_db)
):
    query = db.query(Asset)
    if type:
        query = query.filter(Asset.type == type)
    if project_id is not None:
        query = query.filter(Asset.project_id == project_id)
    assets = query.offset(skip).limit(limit).all()
    return assets

@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


# backend/api/assets.py (部分修改)

@router.put("/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: int, asset_update: AssetUpdate, db: Session = Depends(get_db)):
    original = db.query(Asset).filter(Asset.id == asset_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 如果更新了 data，需要验证
    new_data = asset_update.data if asset_update.data is not None else original.data
    schema = ASSET_DATA_SCHEMAS.get(original.type)
    if schema and asset_update.data is not None:
        try:
            validated_data = schema(**new_data).dict()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"数据格式错误: {e}")
    else:
        validated_data = new_data

    new_asset = Asset(
        type=original.type,
        name=asset_update.name if asset_update.name is not None else original.name,
        description=asset_update.description if asset_update.description is not None else original.description,
        tags=asset_update.tags if asset_update.tags is not None else original.tags,
        data=validated_data,
        thumbnail=asset_update.thumbnail if asset_update.thumbnail is not None else original.thumbnail,
        project_id=asset_update.project_id if asset_update.project_id is not None else original.project_id,
        version=original.version + 1,
        parent_id=original.id,
        source_asset_ids=original.source_asset_ids,
        file_path=original.file_path
    )
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    return new_asset

@router.patch("/{asset_id}/project", response_model=AssetOut)
def update_asset_project(
    asset_id: int,
    update: ProjectUpdate,  # 使用 Pydantic 模型接收请求体
    db: Session = Depends(get_db)
):
    print(f"PATCH called with asset_id={asset_id}, project_id={update.project_id}")
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.project_id = update.project_id
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    return