# backend/models/schemas.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Dict, List, Any, Optional
from datetime import datetime

# --- 1. 资产基础数据结构 (用于校验 Asset.data) ---

class ImageData(BaseModel):
    file_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    format: Optional[str] = "png"

class VideoData(BaseModel):
    file_path: str
    duration: Optional[float] = None
    fps: Optional[int] = None

class PromptData(BaseModel):
    content: str
    negative_prompt: Optional[str] = ""

# 定义别名以兼容不同模块的导入习惯
ImageAssetData = ImageData
VideoAssetData = VideoData
PromptAssetData = PromptData

# 关键：供 assets.py 校验使用
ASSET_DATA_SCHEMAS = {
    "image": ImageData,
    "video": VideoData,
    "prompt": PromptData
}

# --- 2. 资产 API 交互模型 ---

class AssetBase(BaseModel):
    type: str
    name: str
    description: Optional[str] = ""
    tags: List[str] = []
    data: Dict[str, Any]
    thumbnail: Optional[str] = None
    project_id: Optional[int] = None

class AssetCreate(AssetBase):
    pass

class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    data: Optional[Dict[str, Any]] = None
    thumbnail: Optional[str] = None
    project_id: Optional[int] = None

class AssetOut(AssetBase):
    id: int
    version: int
    created_at: datetime
    updated_at: datetime
    parent_id: Optional[int] = None
    source_asset_ids: Optional[List[int]] = None
    model_config = ConfigDict(from_attributes=True)

# --- 3. 模型配置 API 交互模型 (新功能) ---

class ModelConfigBase(BaseModel):
    provider: str
    model_name: str
    display_name: str
    # 🌟 核心新增：将健康状态暴露给前端
    health_status: str = "unknown"
    last_tested_at: Optional[datetime] = None
    capabilities: Dict[str, bool] = Field(default_factory=lambda: {
        "chat": False, "vision": False, "image": False, "video": False
    })
    context_ui_params: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    is_manual: bool = False

class ModelConfigOut(ModelConfigBase):
    id: int
    last_synced: datetime
    model_config = ConfigDict(from_attributes=True)