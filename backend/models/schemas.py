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

    model_config = ConfigDict(extra='allow')  # 保留血缘追踪等额外字段

class VideoData(BaseModel):
    file_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    fps: Optional[float] = None
    format: Optional[str] = None

    model_config = ConfigDict(extra='allow')  # 保留血缘追踪等额外字段

class PromptData(BaseModel):
    content: str
    negative_prompt: Optional[str] = ""

# 🌟 核心修复：新增工作流的数据模型
class WorkflowData(BaseModel):
    workflow_json: Optional[Dict[str, Any]] = None
    parameters: Optional[Dict[str, Any]] = None
    content: Optional[str] = None  # 兼容以前的旧数据

    model_config = ConfigDict(extra='allow')  # 允许存入任何额外的 JSON 字段

# 节点配置资产（单节点存为资产）
class NodeConfigData(BaseModel):
    nodeType: str  # 'generate', 'comfyUIEngine' 等
    config: Dict[str, Any]  # 节点的配置数据

    model_config = ConfigDict(extra='allow')

# 节点模板资产（节点组+连线存为模板）
class NodeTemplateData(BaseModel):
    nodes: List[Dict[str, Any]]  # [{type, relativePosition, config}]
    edges: List[Dict[str, Any]]  # [{sourceIndex, targetIndex, sourceHandle, targetHandle}]

    model_config = ConfigDict(extra='allow')

# 定义别名以兼容不同模块的导入习惯
ImageAssetData = ImageData
VideoAssetData = VideoData
PromptAssetData = PromptData
WorkflowAssetData = WorkflowData # 🌟 新增

# 关键：供 assets.py 校验使用
ASSET_DATA_SCHEMAS = {
    "image": ImageData,
    "video": VideoData,
    "prompt": PromptData,
    "workflow": WorkflowData,
    "node_config": NodeConfigData,
    "node_template": NodeTemplateData,
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
    # 🌟 新增：数据交互字段
    is_favorite: bool = False
    # 🌟 核心跃迁：放弃粗犷分类，全面拥抱大厂 Task Type 标准
    capabilities: Dict[str, bool] = Field(default_factory=lambda: {
        "chat": False,
        "vision": False,
        "text_to_image": False,
        "image_to_image": False,
        "text_to_video": False,
        "image_to_video": False
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

class ProviderBase(BaseModel):
    id: str
    display_name: str
    service_type: str

    # 🌟 Phase 9 新增：代理驱动参数
    api_format: str = "openai_compatible"
    auth_type: str = "Bearer"
    supported_modalities: Optional[List[str]] = Field(default_factory=lambda: ["text"])

    default_base_url: Optional[str] = None
    is_active: bool = True
    icon: Optional[str] = None

    # 🌟 新增：高级路由覆盖与自定义请求头
    endpoints: Optional[Dict[str, str]] = Field(default_factory=dict)
    custom_headers: Optional[Dict[str, str]] = Field(default_factory=dict)


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    service_type: Optional[str] = None
    api_format: Optional[str] = None
    auth_type: Optional[str] = None
    supported_modalities: Optional[List[str]] = None
    default_base_url: Optional[str] = None
    is_active: Optional[bool] = None
    icon: Optional[str] = None
    # 🌟 新增：允许更新高级配置
    endpoints: Optional[Dict[str, str]] = None
    custom_headers: Optional[Dict[str, str]] = None


class ProviderOut(ProviderBase):
    model_config = ConfigDict(from_attributes=True)