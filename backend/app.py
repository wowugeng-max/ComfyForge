# backend/app.py
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uuid
from .core.executors.direct_api import DirectAPIPipelineExecutor
from contextlib import asynccontextmanager
from .db import init_db  # 确保 init_db 已定义
from backend.api import assets
from .core.asset_utils import save_image_from_base64
from .api import assets, projects
from .core.executors.video_loop import VideoLoopExecutor
from .core.executors.cloud_video_loop import CloudVideoLoopExecutor
from .api import keys
import asyncio
from .core.key_monitor import start_key_monitor
from .core.executors.real_video_loop import RealVideoLoopExecutor
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os

# 任务存储（临时，后续会用数据库）
tasks = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化数据库
    from .db import init_db
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
    allow_methods=["*"],  # 允许所有方法（包括 OPTIONS）
    allow_headers=["*"],
)
# 包含资产路由
app.include_router(assets.router)
app.include_router(projects.router)  # 新增
app.include_router(keys.router)

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

@app.post("/api/tasks/direct")
async def run_direct_pipeline(request: DirectAPITaskRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    task_def = request.dict()
    task_def["task_id"] = task_id
    tasks[task_id] = {"status": "pending", "result": None}

    if request.sync:
        executor = DirectAPIPipelineExecutor()
        result = await executor.execute(task_def)
        # 保存图像资产并记录血缘
        visited_ids = result.get("visited_asset_ids", [])
        outputs = result.get("outputs", {})
        created_asset_ids = {}

        # 获取数据库会话
        from .db import SessionLocal
        db = SessionLocal()
        try:
            for key, value in outputs.items():
                # 判断是否为图像 base64
                if isinstance(value, str) and len(value) > 100:
                    # 检查常见的图像 base64 头
                    if value.startswith("iVBOR") or value.startswith("/9j/") or value.startswith("data:image"):
                        try:
                            asset_id = save_image_from_base64(value, db, source_ids=visited_ids)
                            created_asset_ids[key] = asset_id
                            # 可选择将 outputs 中的值替换为资产 ID 或文件路径，但前端可能期望 base64
                            # 这里保持原样，同时返回创建的资产 ID 列表
                        except Exception as e:
                            print(f"Failed to save image for {key}: {e}")
        finally:
            db.close()

        # 将创建的资产 ID 加入结果，供前端参考
        result["created_assets"] = created_asset_ids
        tasks[task_id] = {"status": "completed", "result": result}
        return result
    else:
        # 异步执行：后台任务
        background_tasks.add_task(_run_pipeline_background, task_id, task_def)
        return {"task_id": task_id, "status": "queued"}  # 返回简单状态

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
    print("视频循环端点被调用")  # 添加调试输出
    executor = VideoLoopExecutor()
    try:
        result = await executor.execute(request)
        return result
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/tasks/cloud_video_loop")
async def run_cloud_video_loop(request: dict):
    """云端视频循环生成"""
    # 从配置中读取RunningHub信息（建议从环境变量或数据库读取）
    cloud_config = {
        "base_url": "https://www.runninghub.cn/proxy/your-api-key",  # 替换为你的实际地址
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
    """真实本地视频循环生成（使用工作流模板）"""
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
    # 安全限制：只允许访问 data/temp 目录
    base_dir = os.path.abspath("data/temp")
    full_path = os.path.abspath(os.path.join(base_dir, file_path))
    if not full_path.startswith(base_dir):
        return {"error": "Invalid path"}, 400
    if not os.path.exists(full_path):
        return {"error": "File not found"}, 404
    return FileResponse(full_path)