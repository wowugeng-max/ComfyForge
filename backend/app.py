# backend/app.py
import os
import uuid
import asyncio
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

# --- 1. 统一的相对路径/绝对路径导入 (消除冗余) ---
from backend.db import init_db, SessionLocal, get_db
from backend.core.asset_utils import save_image_from_base64, save_video_as_asset
from backend.core.key_monitor import start_key_monitor
from backend.core.adapters.factory import AdapterFactory
from backend.core.executors.direct_api import DirectAPIPipelineExecutor
from backend.core.executors.video_loop import VideoLoopExecutor
from backend.core.executors.cloud_video_loop import CloudVideoLoopExecutor
from backend.core.executors.real_video_loop import RealVideoLoopExecutor

# 统一集中导入所有 API 路由模块
from backend.api import assets, projects, keys, suggestions, recommendation_rules, models
from backend.models.api_key import APIKey
from fastapi import HTTPException

# 任务存储（临时，后续会用数据库）
tasks = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库
    init_db()
    print("数据库初始化完成")

    # 启动Key监控任务（作为后台任务）
    monitor_task = asyncio.create_task(start_key_monitor(interval_minutes=60))
    print("Key监控任务已启动")

    yield

    # 关闭时取消监控任务
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    print("应用关闭，Key监控已停止")


app = FastAPI(title="ComfyForge API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # 允许前端开发服务器地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. 集中挂载路由 ---
app.include_router(assets.router)
app.include_router(projects.router)
app.include_router(keys.router)
app.include_router(suggestions.router)
app.include_router(recommendation_rules.router)
app.include_router(models.router)


# --- 3. Pydantic 数据模型定义 ---
class PipelineStep(BaseModel):
    step: str
    provider: str
    model: Optional[str] = "default"
    input: Optional[str] = None
    prompt: Optional[str] = None
    image: Optional[str] = None
    output_var: Optional[str] = None
    temperature: Optional[float] = 0.7
    seed: Optional[int] = 42
    extra_params: Optional[Dict[str, Any]] = {}


class DirectAPITaskRequest(BaseModel):
    pipeline: List[PipelineStep]
    api_keys: Dict[str, str]
    sync: bool = True  # 是否同步等待


class TaskResponse(BaseModel):
    task_id: str
    status: str


# --- 1. 更新 Pydantic 请求模型 ---
class GenerateRequest(BaseModel):
    api_key_id: int  # 核心新增：直接接收前端传来的 Key ID，实现严格的 Key-模型 绑定
    provider: str
    model: str
    type: str  # 'image', 'video', 'prompt', 'text'
    prompt: str
    params: Optional[Dict[str, Any]] = {}


# --- 4. 业务接口 ---
@app.post("/api/tasks/direct")
async def run_direct_pipeline(request: DirectAPITaskRequest, background_tasks: BackgroundTasks,
                              db: Session = Depends(get_db)):
    task_id = str(uuid.uuid4())
    task_def = request.dict()
    task_def["task_id"] = task_id
    tasks[task_id] = {"status": "pending", "result": None}

    if request.sync:
        executor = DirectAPIPipelineExecutor()
        result = await executor.execute(task_def)

        visited_ids = result.get("visited_asset_ids", [])
        outputs = result.get("outputs", {})
        created_asset_ids = {}

        for key, value in outputs.items():
            if isinstance(value, str) and len(value) > 100:
                if value.startswith("iVBOR") or value.startswith("/9j/") or value.startswith("data:image"):
                    try:
                        # 注入依赖的 DB
                        asset_id = save_image_from_base64(value, db, source_ids=visited_ids)
                        created_asset_ids[key] = asset_id
                    except Exception as e:
                        print(f"Failed to save image for {key}: {e}")

        result["created_assets"] = created_asset_ids
        tasks[task_id] = {"status": "completed", "result": result}
        return result
    else:
        background_tasks.add_task(_run_pipeline_background, task_id, task_def)
        return {"task_id": task_id, "status": "queued"}


async def _run_pipeline_background(task_id: str, task_def: dict):
    executor = DirectAPIPipelineExecutor()
    try:
        result = await executor.execute(task_def)
        tasks[task_id] = {"status": "completed", "result": result}
    except Exception as e:
        tasks[task_id] = {"status": "failed", "error": str(e)}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    return tasks.get(task_id, {"status": "not found"})


@app.post("/api/tasks/video_loop")
async def run_video_loop(request: dict):
    print("视频循环端点被调用")
    executor = VideoLoopExecutor()
    try:
        result = await executor.execute(request)
        return result
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/tasks/cloud_video_loop")
async def run_cloud_video_loop(request: dict):
    cloud_config = {
        "base_url": "https://www.runninghub.cn/proxy/your-api-key",
        "api_key": None,
        "workflow_template_id": "wan_video_loop_template"
    }

    executor = CloudVideoLoopExecutor(cloud_config)
    try:
        result = await executor.execute(request)
        return result
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/tasks/real_video_loop")
async def run_real_video_loop(request: dict):
    executor = RealVideoLoopExecutor(ffmpeg_path=r"D:\ffmpeg\ffmpeg-2026-02-26\bin\ffmpeg.exe")
    try:
        result = await executor.execute(request)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@app.get("/api/files/{file_path:path}")
async def get_file(file_path: str):
    base_dir = os.path.abspath("data/temp")
    full_path = os.path.abspath(os.path.join(base_dir, file_path))
    if not full_path.startswith(base_dir):
        return {"error": "Invalid path"}, 400
    if not os.path.exists(full_path):
        return {"error": "File not found"}, 404
    return FileResponse(full_path)


# --- 3. 全新的轻量级生成路由 ---
@app.post("/api/generate")
async def generate_content(request: GenerateRequest, db: Session = Depends(get_db)):
    # 1. 从数据库中获取真正的明文 API Key
    key_record = db.query(APIKey).filter(APIKey.id == request.api_key_id).first()
    if not key_record or not key_record.is_active:
        raise HTTPException(status_code=400, detail="无效或未启用的 API Key，请在 Key 管理页面检查")

    # 2. 通过工厂获取对应的轻量级适配器实例
    try:
        adapter = AdapterFactory.get_adapter(request.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 3. 直接调用异步生成方法 (摒弃了旧的线程池 run_in_executor，性能大幅提升)
    try:
        result = await adapter.generate(
            api_key=key_record.key,  # 动态注入查到的明文 Key
            model_name=request.model,  # 前端选中的具体模型名称 (如 gemini-1.5-pro)
            prompt=request.prompt,
            type=request.type,
            extra_params=request.params or {},
        # 🌟 核心修复：连通大动脉，将数据库中的 URL 传给底层适配器
            base_url = key_record.base_url
        )
    except Exception as e:
        # 捕获官方 SDK 抛出的网络错误或额度超限等异常
        raise HTTPException(status_code=500, detail=f"模型生成失败: {str(e)}")

    # 4. 根据返回类型保存资产到本地 SQLite 数据库
    asset_id = None
    if request.type == "image" and result.get("type") == "image":
        asset_id = save_image_from_base64(result["content"], db)
    elif request.type == "video" and result.get("type") == "video":
        asset_id = save_video_as_asset(result["content"], db)

    return {
        "type": result.get("type", "text"),
        "content": result.get("content", ""),
        "asset_id": asset_id
    }