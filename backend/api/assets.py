# backend/api/assets.py
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import get_db  # 统一导入
from ..models import Asset, Project
from ..models.schemas import ASSET_DATA_SCHEMAS

IMAGES_DIR = "data/assets/images"
VIDEOS_DIR = "data/assets/videos"
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}

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
        project_id: Optional[int] = None,
        is_global: Optional[bool] = None,  # 🌟 1. 增加一个专门过滤全局资产的参数
        db: Session = Depends(get_db)
):
    query = db.query(Asset)
    if type:
        query = query.filter(Asset.type == type)

    # 🌟 2. 核心隔离逻辑
    if is_global:
        # 只查询没有绑定项目的“纯公共资产”
        query = query.filter(Asset.project_id.is_(None))
    elif project_id is not None:
        # 只查询绑定了当前项目的资产
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

    # 清理磁盘文件
    if asset.data and isinstance(asset.data, dict):
        file_path = asset.data.get("file_path", "")
        if file_path and not file_path.startswith("http"):
            abs_path = os.path.abspath(file_path)
            if os.path.isfile(abs_path):
                try:
                    os.remove(abs_path)
                except OSError:
                    pass

    db.delete(asset)
    db.commit()
    return


@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的图片格式: {file.content_type}")

    content = await file.read()

    # 用 PIL 读取尺寸
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(content))
        width, height = img.size
        fmt = (img.format or "PNG").lower()
        if fmt == "jpeg":
            fmt = "jpg"
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析图片文件")

    ext = os.path.splitext(file.filename or "")[-1] or f".{fmt}"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(IMAGES_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "file_path": file_path.replace("\\", "/"),
        "width": width,
        "height": height,
        "format": fmt,
    }


@router.post("/upload/video")
async def upload_video(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail=f"不支持的视频格式: {file.content_type}")

    content = await file.read()
    ext = os.path.splitext(file.filename or ".mp4")[-1] or ".mp4"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(VIDEOS_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # 尝试用 ffprobe 获取视频信息，失败则返回默认值
    width, height, duration, fps = 0, 0, 0.0, 0.0
    try:
        import subprocess, json
        cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", file_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        info = json.loads(result.stdout)
        vs = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
        if vs:
            width = int(vs.get("width", 0))
            height = int(vs.get("height", 0))
            duration = float(vs.get("duration", 0))
            parts = vs.get("r_frame_rate", "30/1").split("/")
            fps = round(int(parts[0]) / int(parts[1]), 2) if len(parts) == 2 and int(parts[1]) else 30.0
    except Exception:
        pass

    fmt = ext.lstrip(".").lower()
    return {
        "file_path": file_path.replace("\\", "/"),
        "width": width,
        "height": height,
        "duration": duration,
        "fps": fps,
        "format": fmt,
    }


@router.get("/media/{file_path:path}")
async def serve_media(file_path: str):
    """提供 data/assets/ 下的图片和视频文件"""
    base_dir = os.path.abspath("data/assets")
    # 兼容前端传来的带 data/assets/ 前缀的路径
    clean = file_path.lstrip("/")
    if clean.startswith("data/assets/"):
        clean = clean[len("data/assets/"):]
    full_path = os.path.abspath(os.path.join(base_dir, clean))
    if not full_path.startswith(base_dir) or not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(full_path)