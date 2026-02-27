# backend/api/assets.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import SessionLocal
from ..models.asset import Asset

router = APIRouter(prefix="/api/assets", tags=["assets"])


# Pydantic 模型用于请求和响应
class AssetBase(BaseModel):
    type: str
    name: str
    description: Optional[str] = ""
    tags: List[str] = []
    data: dict
    thumbnail: Optional[str] = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    data: Optional[dict] = None
    thumbnail: Optional[str] = None


class AssetOut(AssetBase):
    id: int
    version: int
    created_at: datetime
    updated_at: datetime
    parent_id: Optional[int] = None
    source_asset_ids: Optional[List[int]] = None  # 新增字段

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
    db_asset = Asset(
        type=asset.type,
        name=asset.name,
        description=asset.description,
        tags=asset.tags,
        data=asset.data,
        thumbnail=asset.thumbnail
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
        db: Session = Depends(get_db)
):
    query = db.query(Asset)
    if type:
        query = query.filter(Asset.type == type)
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
    # 查询原资产
    original = db.query(Asset).filter(Asset.id == asset_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 创建新版本
    new_asset = Asset(
        type=original.type,
        name=asset_update.name if asset_update.name is not None else original.name,
        description=asset_update.description if asset_update.description is not None else original.description,
        tags=asset_update.tags if asset_update.tags is not None else original.tags,
        data=asset_update.data if asset_update.data is not None else original.data,
        thumbnail=asset_update.thumbnail if asset_update.thumbnail is not None else original.thumbnail,
        version=original.version + 1,
        parent_id=original.id,  # 指向原资产
        source_asset_ids=original.source_asset_ids,
        file_path=original.file_path
    )
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    return new_asset


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(asset)
    db.commit()
    return