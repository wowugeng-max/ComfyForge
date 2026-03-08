# backend/core/adapters/universal_proxy.py
import httpx
import asyncio
from typing import Dict, Any
from .base import BaseAdapter
from backend.core.registry import ProviderRegistry
from backend.models.provider import Provider
from backend.models.api_key import APIKey


@ProviderRegistry.register_adapter("universal_openai")
class UniversalProxyAdapter(BaseAdapter):
    """
    万能大模型适配器 (Config-Driven)
    全面支持：文本生成、视觉识图、图片生成、异步视频生成 (自动轮询等待)
    """

    def __init__(self, provider: Provider, api_key: APIKey = None):
        self.provider = provider
        self.api_key = api_key

        # 优先使用 API Key 配置的自定义网关
        self.base_url = (
            self.api_key.base_url if self.api_key and self.api_key.base_url else self.provider.default_base_url)
        if self.base_url and self.base_url.endswith("/"):
            self.base_url = self.base_url[:-1]

    def _build_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if not self.api_key or not self.api_key.key:
            return headers

        auth_type = self.provider.auth_type.lower()
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {self.api_key.key}"
        elif auth_type == "x-api-key":
            headers["x-api-key"] = self.api_key.key

        return headers

    def _build_payload(self, request_params: Dict[str, Any], req_type: str) -> Dict[str, Any]:
        model_name = request_params.get("model", "default")

        # 🌟 1. 视频生成协议
        if req_type == "video":
            payload = {"model": model_name, "prompt": request_params.get("prompt", "")}
            if "image" in request_params:
                payload["image"] = request_params["image"]
            elif "image_url" in request_params:
                payload["image_url"] = request_params["image_url"]

            for k in ["size", "duration", "aspect_ratio", "fps"]:
                if k in request_params:
                    payload[k] = request_params[k]
            return payload

        # 🌟 2. 图片生成协议
        if req_type == "image":
            return {
                "model": model_name,
                "prompt": request_params.get("prompt", ""),
                "n": 1,
                "size": request_params.get("size", "1024x1024")
            }

        # 🌟 3. 文本与识图协议
        messages = request_params.get("messages", [])
        if not messages and "prompt" in request_params:
            messages = [{"role": "user", "content": request_params["prompt"]}]

        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": request_params.get("temperature", 0.7),
            "max_tokens": request_params.get("max_tokens", 2048),
        }
        return {k: v for k, v in payload.items() if v is not None}

    async def generate(self, request_params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.base_url:
            raise ValueError(f"Provider [{self.provider.id}] 没有配置 base_url")

        req_type = request_params.get("type", "text")
        headers = self._build_headers()
        payload = self._build_payload(request_params, req_type)

        # 动态端点
        if req_type == "video":
            endpoint = f"{self.base_url}/videos/generations"
        elif req_type == "image":
            endpoint = f"{self.base_url}/images/generations"
        else:
            endpoint = f"{self.base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=30.0) as client:  # 初始请求超时不用太长
            try:
                # ================= 1. 提交初始请求 =================
                response = await client.post(endpoint, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()

                # ================= 2. 自动嗅探异步轮询 =================
                task_id = data.get("task_id") or data.get("id")
                status = str(data.get("status") or data.get("task_status", "")).lower()

                # 如果发现任务处于排队/处理中，自动进入轮询模式
                if task_id and status in ["pending", "processing", "submitted", "in_progress", "queued"]:
                    # 兼容不同厂商的轮询规范 (默认 RESTful, 特殊处理阿里 DashScope)
                    if "dashscope" in self.base_url:
                        poll_endpoint = f"{self.base_url}/tasks/{task_id}"
                    else:
                        poll_endpoint = f"{endpoint}/{task_id}"

                    max_attempts = 60  # 最大轮询 60 次 (约 10 分钟)
                    for attempt in range(max_attempts):
                        await asyncio.sleep(10)  # 每 10 秒查一次

                        poll_resp = await client.get(poll_endpoint, headers=headers)
                        poll_resp.raise_for_status()
                        poll_data = poll_resp.json()

                        current_status = str(poll_data.get("status") or poll_data.get("task_status", "")).lower()

                        if current_status in ["succeeded", "success", "completed"]:
                            data = poll_data  # 替换为最终成功的数据
                            break
                        elif current_status in ["failed", "error", "cancelled"]:
                            return {"success": False, "error": f"异步任务执行失败: {poll_data}"}

                        # 还在处理中则静默等待，继续下一个循环...
                    else:
                        return {"success": False, "error": f"任务超时 (超过10分钟未出结果): {task_id}"}

                # ================= 3. 结果提取清洗 =================
                if req_type in ["image", "video"]:
                    # 多厂商防御性提取逻辑 (兼容 OpenAI, 阿里 DashScope, 智谱等)
                    if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
                        content = data["data"][0].get("url") or data["data"][0].get("b64_json")
                    elif "output" in data:  # 阿里 DashScope (如 Wan2.2, 通义万相)
                        content = data["output"].get("video_url") or data["output"].get("url") or data["output"].get(
                            "image_url")
                    elif "video_result" in data:  # 智谱 CogVideo
                        content = data["video_result"][0].get("url")
                    else:
                        content = str(data)  # 终极兜底
                else:
                    content = data["choices"][0]["message"]["content"]

                return {
                    "success": True,
                    "type": req_type,
                    "content": content,
                    "raw_response": data
                }
            except httpx.HTTPStatusError as e:
                return {"success": False, "error": f"HTTP Error {e.response.status_code}: {e.response.text}"}
            except Exception as e:
                return {"success": False, "error": str(e)}