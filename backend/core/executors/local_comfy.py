# backend/core/executors/local_comfy.py
import httpx
import asyncio
import json
import os
import uuid
import shutil
from typing import Dict, Any, List, Optional
from .base import BaseExecutor

class LocalComfyExecutor(BaseExecutor):
    """
    本地 ComfyUI 执行器
    通过 HTTP API 与本地 ComfyUI 交互，执行单个工作流
    """
    def __init__(self, base_url: str = "http://127.0.0.1:8188", input_dir: str = None):
        self.base_url = base_url.rstrip('/')
        # 设置 ComfyUI 的输入目录（用于复制输入文件）
        if input_dir is None:
            # 默认假设 ComfyUI 运行目录下的 input 文件夹
            self.input_dir = os.path.abspath(r"D:\ComfyUI_portable\ComfyUI_windows_portable\ComfyUI\input")  # 根据实际路径调整
        else:
            self.input_dir = input_dir
        os.makedirs(self.input_dir, exist_ok=True)
        self.client = httpx.AsyncClient(timeout=300.0)

    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行单个工作流
        task_def 必须包含:
            - workflow_json: Dict  完整的 ComfyUI 工作流 JSON（已填充参数）
            - input_files: Dict[str, str]  需要复制到 input 目录的文件映射，键为参数名，值为原始路径
        """
        workflow = task_def["workflow_json"]
        input_files = task_def.get("input_files")  # 可能为 None

        if input_files:
            # 复制文件到 ComfyUI input 目录（但不自动更新工作流）
            for param_name, src_path in input_files.items():
                if not os.path.exists(src_path):
                    raise FileNotFoundError(f"Source file not found: {src_path}")
                filename = os.path.basename(src_path)
                unique_name = f"{uuid.uuid4().hex}_{filename}"
                dest_path = os.path.join(self.input_dir, unique_name)
                shutil.copy2(src_path, dest_path)
                # 注意：这里不自动更新工作流，因为调用者应在之前已填充好

        # 提交工作流
        prompt_id = await self._queue_prompt(workflow)
        print(f"📤 Submitted prompt, ID: {prompt_id}")
        # 等待完成
        history = await self._wait_for_completion(prompt_id)
        print(f"📥 Full history for prompt {prompt_id}: {json.dumps(history, indent=2, ensure_ascii=False)}")

        # 提取输出文件并下载到临时目录
        output_files = await self._extract_outputs(history)
        return {
            "prompt_id": prompt_id,
            "output_files": output_files,
            "history": history
        }

    async def _queue_prompt(self, workflow: Dict) -> str:
        url = f"{self.base_url}/prompt"
        resp = await self.client.post(url, json={"prompt": workflow})
        resp.raise_for_status()
        return resp.json()["prompt_id"]

    async def _wait_for_completion(self, prompt_id: str, timeout: int = 600) -> Dict:
        start = asyncio.get_event_loop().time()
        while True:
            await asyncio.sleep(1)
            url = f"{self.base_url}/history"
            resp = await self.client.get(url)
            resp.raise_for_status()
            history = resp.json()
            if prompt_id in history:
                return history[prompt_id]
            if asyncio.get_event_loop().time() - start > timeout:
                raise TimeoutError(f"Task {prompt_id} timeout")

    async def _download_file(self, filename: str, subfolder: str = "", file_type: str = "output") -> bytes:
        params = {"filename": filename, "subfolder": subfolder, "type": file_type}
        url = f"{self.base_url}/view"
        resp = await self.client.get(url, params=params)
        resp.raise_for_status()
        return resp.content

    async def _extract_outputs(self, history: Dict) -> List[str]:
        """从 history 中提取所有输出文件并下载到临时目录"""
        output_files = []
        outputs = history.get("outputs", {})
        print(f"🔍 [DEBUG] history outputs: {outputs}")  # 打印完整输出

        for node_id, node_output in outputs.items():
            # 处理 images
            for img in node_output.get("images", []):
                content = await self._download_file(img["filename"], img.get("subfolder", ""),
                                                    img.get("type", "output"))
                path = self._save_temp_file(content, img["filename"])
                output_files.append(path)
                print(f"✅ Downloaded image: {path}")

            # 处理 gifs (有时视频节点会输出到 gifs)
            for gif in node_output.get("gifs", []):
                content = await self._download_file(gif["filename"], gif.get("subfolder", ""),
                                                    gif.get("type", "output"))
                path = self._save_temp_file(content, gif["filename"])
                output_files.append(path)
                print(f"✅ Downloaded gif/video: {path}")

            # 处理 videos (VHS_VideoCombine 可能输出到这里)
            for video in node_output.get("videos", []):
                content = await self._download_file(video["filename"], video.get("subfolder", ""),
                                                    video.get("type", "output"))
                path = self._save_temp_file(content, video["filename"])
                output_files.append(path)
                print(f"✅ Downloaded video: {path}")

        return output_files

    def _save_temp_file(self, content: bytes, original_filename: str) -> str:
        os.makedirs("data/temp", exist_ok=True)
        ext = os.path.splitext(original_filename)[1]
        filename = f"{uuid.uuid4().hex}{ext}"
        # 使用绝对路径
        abs_temp_dir = os.path.abspath("data/temp")
        path = os.path.join(abs_temp_dir, filename)
        with open(path, "wb") as f:
            f.write(content)
        return path  # 现在是绝对路径

# 在 LocalComfyExecutor 类中添加
    def prepare_input_files(self, file_map: Dict[str, str]) -> Dict[str, str]:
        """
        将文件复制到 ComfyUI 输入目录，返回参数名到文件名的映射。
        file_map: {param_name: source_path}
        """
        result = {}
        os.makedirs(self.input_dir, exist_ok=True)
        for param_name, src_path in file_map.items():
            if not os.path.exists(src_path):
                raise FileNotFoundError(f"File not found: {src_path}")
            # 生成唯一文件名
            filename = f"{uuid.uuid4().hex}_{os.path.basename(src_path)}"
            dest = os.path.join(self.input_dir, filename)
            shutil.copy2(src_path, dest)
            result[param_name] = filename  # 只返回文件名（相对路径），ComfyUI 加载时会自动在 input 目录下找
        return result

    async def close(self):
        await self.client.aclose()