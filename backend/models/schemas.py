# backend/models/schemas.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Dict, List, Any, Optional
from datetime import datetime
# --- 4. API Key 数据验证模型 (从 keys.py 迁移并升级) ---
from pydantic import validator

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


class APIKeyBase(BaseModel):
    provider: str
    key: Optional[str] = ""  # 🌟 改为可选，因为本地 ComfyUI 没密码也可以
    description: Optional[str] = ""
    is_active: Optional[bool] = True
    priority: Optional[int] = 0
    tags: Optional[List[str]] = []
    quota_total: Optional[int] = 0
    quota_unit: Optional[str] = "count"
    price_per_call: Optional[float] = 0.0

    # 🌟 核心新增：服务类型与自定义网关
    service_type: str = "llm"
    base_url: Optional[str] = None


class APIKeyCreate(APIKeyBase):
    pass


class APIKeyUpdate(BaseModel):
    description: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    tags: Optional[List[str]] = None
    # 允许更新这两个新字段
    service_type: Optional[str] = None
    base_url: Optional[str] = None


class APIKeyOut(APIKeyBase):
    id: int
    quota_remaining: int
    success_count: int
    failure_count: int
    avg_latency: float
    last_used: Optional[datetime]
    last_checked: Optional[datetime] = None  # 避免没有检查过时报错
    created_at: datetime
    expires_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)  # 使用 Pydantic V2 规范

    # 保留你原本优秀的默认值校验逻辑
    @validator('quota_remaining', pre=True, always=True)
    def validate_quota_remaining(cls, v):
        return v if v is not None else 0

    @validator('success_count', pre=True, always=True)
    def validate_success_count(cls, v):
        return v if v is not None else 0

    @validator('failure_count', pre=True, always=True)
    def validate_failure_count(cls, v):
        return v if v is not None else 0

    @validator('avg_latency', pre=True, always=True)
    def validate_avg_latency(cls, v):
        return v if v is not None else 0.0


# --- 5. 提供商 (Provider) 交互模型 ---
class ProviderOut(BaseModel):
    id: str
    display_name: str
    service_type: str
    default_base_url: Optional[str] = None
    is_active: bool
    icon: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)