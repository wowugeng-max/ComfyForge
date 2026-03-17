# backend/app.py
import os
import uuid
import asyncio
import inspect
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

# 🌟 核心破案：必须引入 WebSocket 和 BackgroundTasks
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import init_db, SessionLocal, get_db
from backend.core.asset_utils import save_image_from_base64, save_video_as_asset
from backend.core.key_monitor import start_key_monitor
from backend.core.adapters.factory import AdapterFactory
from backend.core.executors.direct_api import DirectAPIPipelineExecutor
from backend.core.executors.video_loop import VideoLoopExecutor
from backend.core.executors.cloud_video_loop import CloudVideoLoopExecutor
from backend.core.executors.real_video_loop import RealVideoLoopExecutor

from backend.api import assets, projects, keys, suggestions, recommendation_rules, models, providers
from backend.models.api_key import APIKey
from backend.models.provider import Provider
# 🌟 引入我们创建的 WS 广播中心
from backend.core.ws import manager

tasks = {}
# 🌟 Phase 10: 建立全局任务管家，记录 client_id 与其正在执行的 Adapter 实例
active_adapters: Dict[str, Any] = {}
# 🌟 核弹级新增：追踪底层的异步协程任务实体
active_tasks: Dict[str, asyncio.Task] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("数据库初始化完成")
    monitor_task = asyncio.create_task(start_key_monitor(interval_minutes=60))
    print("Key监控任务已启动")
    yield
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    print("应用关闭，Key监控已停止")

app = FastAPI(title="ComfyForge API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router)
app.include_router(projects.router)
app.include_router(keys.router)
app.include_router(suggestions.router)
app.include_router(recommendation_rules.router)
app.include_router(models.router)
app.include_router(providers.router)

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
    sync: bool = True

class TaskResponse(BaseModel):
    task_id: str
    status: str

# 🌟 修复后的 Pydantic 模型，加上了 image_url 和 messages
class GenerateRequest(BaseModel):
    api_key_id: int
    provider: str
    model: str
    type: str
    prompt: Optional[str] = ""
    image_url: Optional[str] = None
    messages: Optional[list] = None
    params: Optional[Dict[str, Any]] = {}

@app.post("/api/tasks/direct")
async def run_direct_pipeline(request: DirectAPITaskRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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
    executor = VideoLoopExecutor()
    try:
        return await executor.execute(request)
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
        return await executor.execute(request)
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/tasks/real_video_loop")
async def run_real_video_loop(request: dict):
    executor = RealVideoLoopExecutor(ffmpeg_path=r"D:\ffmpeg\ffmpeg-2026-02-26\bin\ffmpeg.exe")
    try:
        return await executor.execute(request)
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/files/{file_path:path}")
async def get_file(file_path: str):
    base_dir = os.path.abspath("data/temp")
    full_path = os.path.abspath(os.path.join(base_dir, file_path))
    if not full_path.startswith(base_dir) or not os.path.exists(full_path):
        return {"error": "Not found"}, 404
    return FileResponse(full_path)

# ----------------------------------------------------------------------
# 🌟🌟🌟 下面才是本次核心升级的三大金刚！🌟🌟🌟
# ----------------------------------------------------------------------

# 1. 真实 WebSocket 接收端 (防止前端连到假替身上)
@app.websocket("/api/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket,client_id)

# 2. 真正的后台异步兵工厂 (在这里调用算力引擎)
async def run_adapter_task(adapter, request_params: dict, client_id: str):
    try:
        # 🌟 兵工厂开工第一件事：登记入册，让大管家知道这个 client_id 对应的算力引擎实例
        active_adapters[client_id] = adapter

        result = await adapter.generate(request_params)
        if result.get("success"):
            await manager.send_message({"type": "result", "data": result}, client_id)
        else:
            await manager.send_message({"type": "error", "message": result.get("error", "未知错误")}, client_id)

    except asyncio.CancelledError:
        # 🌟🌟🌟 核心：捕获 task.cancel() 带来的强制中止信号
        print(f"💥 [Task Manager] 任务 {client_id} 被强行中止 (底层网络连接已斩断)")
        await manager.send_message({"type": "error", "message": "任务已被手动强行终止"}, client_id)

    except Exception as e:
        await manager.send_message({"type": "error", "message": f"引擎异常: {str(e)}"}, client_id)
    finally:
        # 🌟 无论成功、失败还是被中断，结束时必须擦除记录，防止内存泄漏
        active_adapters.pop(client_id, None)
        active_tasks.pop(client_id, None)

# 3. 终极版 Generate 路由 (负责发牌和 HTTP 秒回)
# ⚠️ 注意：去掉了参数里的 background_tasks
# ⚠️ 注意：去掉了参数里的 background_tasks
@app.post("/api/generate")
async def generate_content(request: GenerateRequest, db: Session = Depends(get_db)):
    key_record = db.query(APIKey).filter(APIKey.id == request.api_key_id).first()
    if not key_record or not key_record.is_active:
        raise HTTPException(status_code=400, detail="无效或未启用的 API Key")

    provider_record = db.query(Provider).filter(Provider.id == request.provider).first()
    if not provider_record:
        raise HTTPException(status_code=400, detail="未找到 Provider 运行配置")

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

        client_id = request.params.get("client_id") if request.params else None

        if client_id:
            # 🚀 核弹级修复：彻底弃用 background_tasks，改用 asyncio.create_task 抓取实体！
            task = asyncio.create_task(run_adapter_task(adapter, request_params, client_id))
            active_tasks[client_id] = task  # 登记入册，暴露给中断刀斧手
            return {"success": True, "message": "任务已交由后台引擎处理"}
        else:
            result = await adapter.generate(request_params)
            if not result.get("success"):
                raise HTTPException(status_code=500, detail=result.get("error", "未知生成错误"))
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"算力分配异常: {str(e)}")


# 🌟 新增：暴露给前端的一键中断路由 (直接加在 run_adapter_task 下方即可)
# backend/app.py

@app.post("/api/interrupt/{client_id}")
async def interrupt_task(client_id: str):
    print(f"\n🛑 收到前端紧急刹车指令，正在搜索目标任务: {client_id}...")
    physical_success = False
    killed = False

    # 1. 第一重斩杀：发送物理显存释放指令
    if client_id in active_adapters:
        adapter = active_adapters[client_id]
        physical_success = await adapter.interrupt()
        print(f"  👉 [中断步骤 1] 物理释放 GPU 显存: {'成功' if physical_success else '忽略'}")

    # 2. 第二重斩杀：直接杀死 Python 底层死等的网络连接 (拔网线)
    if client_id in active_tasks:
        task = active_tasks[client_id]
        if not task.done():
            task.cancel()  # 这里会瞬间触发 run_adapter_task 中的 CancelledError
            killed = True
            print(f"  👉 [中断步骤 2] 🔪 Python 挂起协程已被强制斩首 (task.cancel)")

    if killed or physical_success:
        print(f"✅ 任务 {client_id} 拦截完毕！\n")
        return {
            "success": True,
            "message": "已斩断底层任务并释放资源",
            "physical_interrupted": physical_success
        }

    print(f"⚠️ 中断失败：管家字典中未找到运行中的 {client_id}\n")
    return {
        "success": False,
        "message": "未找到正在运行的任务"
    }