# backend/models/schemas.py
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any

# ---------- Prompt 资产 ----------
class PromptData(BaseModel):
    content: str
    negative: Optional[str] = None

    # 可添加自定义验证，例如 content 不能为空
    @validator('content')
    def content_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('prompt content cannot be empty')
        return v.strip()

# ---------- Image 资产 ----------
class ImageData(BaseModel):
    file_path: str
    width: int
    height: int
    format: str
    original_base64_preview: Optional[str] = None  # 预览用，可不存完整

    @validator('width', 'height')
    def positive_dimensions(cls, v):
        if v <= 0:
            raise ValueError('width and height must be positive')
        return v

# ---------- Character 资产 ----------
class CharacterData(BaseModel):
    core_prompt_asset_id: int
    image_asset_ids: List[int] = Field(default_factory=list)
    lora_asset_id: Optional[int] = None
    variants: Dict[str, int] = Field(default_factory=dict)  # 变体名称 -> prompt 资产 ID

    # 可选：验证 core_prompt_asset_id 对应的资产是否存在（需要传入 db，这里留空，可在上层处理）
    # @validator('core_prompt_asset_id')
    # def check_asset_exists(cls, v):
    #     # 实际使用时可在 API 层查询数据库
    #     return v

# ---------- VIDEO 资产 ----------
class VideoData(BaseModel):
    file_path: str
    width: int
    height: int
    duration: float  # 视频时长（秒）
    fps: float  # 帧率
    format: str  # 如 "mp4"
    original_base64_preview: Optional[str] = None  # 首帧预览

    @validator('width', 'height', 'duration', 'fps')
    def positive_numbers(cls, v):
        if v <= 0:
            raise ValueError('width, height, duration, fps must be positive')
        return v

# ---------- Workflow 资产 ----------
class WorkflowData(BaseModel):
    workflow_json: Dict[str, Any] = Field(..., description="完整的 ComfyUI 工作流 JSON")
    parameters: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="参数定义，例如：{'positive_prompt': {'node_id': '6', 'field': 'inputs/strings'}}"
    )
    thumbnail_node_id: Optional[str] = Field(
        None,
        description="用于预览的节点 ID，可以是图像输出节点"
    )

    @validator('workflow_json')
    def validate_workflow_json(cls, v):
        if not isinstance(v, dict):
            raise ValueError("workflow_json must be a dictionary")
        return v

# 资产类型到验证模型的映射（用于动态选择）
ASSET_DATA_SCHEMAS = {
    'prompt': PromptData,
    'image': ImageData,
    'character': CharacterData,
    'video': VideoData,   # 新增
    'workflow': WorkflowData,  # 新增
}