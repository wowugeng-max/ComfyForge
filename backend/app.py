# backend/app.py
import os
import uuid
import asyncio
import inspect
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
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
from backend.api import assets, projects, keys, suggestions, recommendation_rules, models, providers
from backend.models.api_key import APIKey
from backend.models.provider import Provider  # 🌟 Phase 9: 引入提供商配置底座

from fastapi import WebSocket, WebSocketDisconnect, BackgroundTasks
from backend.core.ws import manager

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
app.include_router(providers.router)  # 🌟 挂载提供商路由


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


class GenerateRequest(BaseModel):
    api_key_id: int  # 严格的 Key-模型 绑定
    provider: str
    model: str
    type: str  # 'image', 'video', 'prompt', 'text'
    prompt: str
    image_url: Optional[str] = None  # 🌟 补齐：接收前端传来的垫图/参考图
    messages: Optional[list] = None  # 🌟 补齐：接收前端传来的多轮对话或大模型格式消息
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


# --- 5. 🌟 新增：WebSocket 挂载路由 ---
@app.websocket("/api/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            # 保持连接存活，接收前端可能发来的 ping
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)

# --- 🌟 新增：后台渲染兵工厂 ---
async def run_adapter_task(adapter, request_params: dict, client_id: str):
    try:
        result = await adapter.generate(request_params)
        # 渲染完成后，通过 WS 把图片/视频结果精准推给对应的画布节点
        if result.get("success"):
            await manager.send_message({"type": "result", "data": result}, client_id)
        else:
            await manager.send_message({"type": "error", "message": result.get("error", "未知错误")}, client_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        await manager.send_message({"type": "error", "message": f"引擎底层异常: {str(e)}"}, client_id)

# --- 🌟 升级：全新的配置驱动生成路由 ---
@app.post("/api/generate")
async def generate_content(request: GenerateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    key_record = db.query(APIKey).filter(APIKey.id == request.api_key_id).first()
    if not key_record or not key_record.is_active:
        raise HTTPException(status_code=400, detail="无效或未启用的 API Key，请检查")

    provider_record = db.query(Provider).filter(Provider.id == request.provider).first()
    if not provider_record:
        raise HTTPException(status_code=400, detail=f"未找到 Provider [{request.provider}] 的运行配置")

    try:
        adapter_class = AdapterFactory.get_adapter(provider_record.id, db)
        adapter = adapter_class(provider=provider_record, api_key=key_record)

        request_params = {
            "model": request.model,
            "type": request.type,
            "prompt": request.prompt,
        }
        if request.image_url:
            request_params["image_url"] = request.image_url
        if request.messages:
            request_params["messages"] = request.messages
        if request.params:
            request_params.update(request.params)

        # 🌟 判断：前端是否指明了接收结果的节点 ID
        client_id = request.params.get("client_id") if request.params else None

        if client_id:
            # 🚀 WS 异步模式：扔进后台执行，HTTP 接口直接秒回！永不超时！
            background_tasks.add_task(run_adapter_task, adapter, request_params, client_id)
            return {"success": True, "message": "任务已投递后台队列"}
        else:
            # 兼容旧节点的同步阻塞模式 (例如 LLM 编剧节点)
            result = await adapter.generate(request_params)
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error", "未知生成错误"))
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"算力分配异常: {str(e)}")