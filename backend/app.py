# backend/app.py
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uuid
from .core.executors.direct_api import DirectAPIPipelineExecutor

app = FastAPI(title="ComfyForge API")

# 任务存储（临时，后续会用数据库）
tasks = {}

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

@app.post("/api/tasks/direct", response_model=TaskResponse)
async def run_direct_pipeline(request: DirectAPITaskRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    task_def = request.dict()
    task_def["task_id"] = task_id
    tasks[task_id] = {"status": "pending", "result": None}

    if request.sync:
        # 同步执行（直接等待）
        executor = DirectAPIPipelineExecutor()
        result = await executor.execute(task_def)
        tasks[task_id] = {"status": "completed", "result": result}
        return TaskResponse(task_id=task_id, status="completed")
    else:
        # 后台执行
        background_tasks.add_task(_run_pipeline_background, task_id, task_def)
        return TaskResponse(task_id=task_id, status="queued")

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