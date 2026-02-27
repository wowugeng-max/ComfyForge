# backend/app.py
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uuid
from .core.executors.direct_api import DirectAPIPipelineExecutor
from contextlib import asynccontextmanager
from .db import init_db  # 确保 init_db 已定义
from backend.api import assets

# 任务存储（临时，后续会用数据库）
tasks = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    init_db()  # 创建数据库表
    print("数据库表已初始化")
    yield
    # 关闭时执行（可选）
    print("应用关闭")

app = FastAPI(title="ComfyForge API", lifespan=lifespan)
# 包含资产路由
app.include_router(assets.router)

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

@app.post("/api/tasks/direct")  # 移除 response_model，或者改为动态响应
async def run_direct_pipeline(request: DirectAPITaskRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    task_def = request.dict()
    task_def["task_id"] = task_id
    tasks[task_id] = {"status": "pending", "result": None}

    if request.sync:
        # 同步执行：直接执行并返回结果
        executor = DirectAPIPipelineExecutor()
        result = await executor.execute(task_def)
        # 可以选择存储结果，但直接返回即可
        tasks[task_id] = {"status": "completed", "result": result}
        return result  # 直接返回 executor 的结果字典
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