# backend/core/cloud_comfy_client.py
import httpx
import time
import json
import asyncio
from typing import Dict, Any, Optional, List
import logging

logger = logging.getLogger(__name__)


class CloudComfyClient:
    """云端ComfyUI客户端（适用于RunningHub、阿里云EAS等）"""

    def __init__(self, base_url: str, api_key: str = None):
        """
        :param base_url: 云端API地址，例如 https://www.runninghub.cn/proxy/your-api-key
        :param api_key: 可选，如果base_url中未包含
        """
        self.base_url = base_url.rstrip('/')
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"

    async def queue_prompt(self, workflow: Dict[str, Any]) -> str:
        """提交工作流，返回prompt_id"""
        url = f"{self.base_url}/prompt"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json={"prompt": workflow}, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            prompt_id = data.get("prompt_id")
            if not prompt_id:
                raise ValueError(f"No prompt_id in response: {data}")
            return prompt_id

    async def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """获取任务历史，判断是否完成"""
        url = f"{self.base_url}/history/{prompt_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def wait_for_completion(self, prompt_id: str, timeout: int = 600, poll_interval: int = 5) -> Dict[str, Any]:
        """
        轮询等待任务完成
        :return: 完成后的历史数据（包含输出文件信息）
        """
        start_time = time.time()
        while time.time() - start_time < timeout:
            history = await self.get_history(prompt_id)
            if prompt_id in history:
                # 任务完成
                return history[prompt_id]
            await asyncio.sleep(poll_interval)
        raise TimeoutError(f"Task {prompt_id} timeout after {timeout}s")

    async def download_output(self, filename: str, subfolder: str = "", output_type: str = "output") -> bytes:
        """下载生成的文件（图片/视频）"""
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": output_type
        }
        url = f"{self.base_url}/view"
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(url, params=params, headers=self.headers)
            response.raise_for_status()
            return response.content