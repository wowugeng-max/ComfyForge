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

        is_dashscope = "dashscope" in self.base_url

        # 🌟 1. 动态端点 & DashScope 官方原生协议拦截器
        is_dashscope = "dashscope" in self.base_url

        # 🌟 1. 动态端点 & DashScope 官方原生协议拦截器
        if is_dashscope and req_type in ["image", "video"]:
            # 阿里百炼兼容模式的残缺修补：强行转为 DashScope 原生 API
            dashscope_base = "https://dashscope.aliyuncs.com/api/v1"
            headers["X-DashScope-Async"] = "enable"  # 阿里原生强制要求异步头

            model_name = payload.get("model", "wanx-v1")

            if req_type == "image":
                endpoint = f"{dashscope_base}/services/aigc/text2image/image-synthesis"
                payload = {
                    "model": model_name,
                    "input": {"prompt": request_params.get("prompt", "A white circle")},
                    # 🌟 仅保留最核心的尺寸替换修复
                    "parameters": {"size": request_params.get("size", "1024*1024").replace("x", "*")}
                }
            else:
                endpoint = f"{dashscope_base}/services/aigc/video-generation/video-synthesis"
                payload = {
                    "model": model_name,
                    "input": {"prompt": request_params.get("prompt", "A moving white cloud")},
                    "parameters": {}
                }
                if "image_url" in request_params:
                    payload["input"]["img_url"] = request_params["image_url"]

            # (已删除了之前在这里强行塞入 img_url 的防呆代码)

        else:
            # 标准 OpenAI 路由 (适用官方 OpenAI 及大部分中转站)
            if req_type == "video":
                endpoint = f"{self.base_url}/videos/generations"
            elif req_type == "image":
                endpoint = f"{self.base_url}/images/generations"
            else:
                endpoint = f"{self.base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # ================= 2. 提交初始请求 =================
                response = await client.post(endpoint, headers=headers, json=payload)

                # 🌟 终极容错与降级 (仅对非 DashScope 的野路子中转站生效)
                if response.status_code == 404 and req_type in ["image", "video"] and not is_dashscope:
                    fallback_endpoint = f"{self.base_url}/chat/completions"
                    fallback_payload = {
                        "model": payload.get("model"),
                        "messages": [{"role": "user",
                                      "content": request_params.get("prompt", "Please draw a simple white circle")}],
                    }
                    response = await client.post(fallback_endpoint, headers=headers, json=fallback_payload)

                response.raise_for_status()
                data = response.json()

                # ================= 3. 自动嗅探异步轮询 =================
                # 提取 DashScope 原生 task_id 或标准 task_id
                task_id = data.get("task_id") or data.get("id")
                if is_dashscope and "output" in data:
                    task_id = task_id or data["output"].get("task_id")

                status = str(data.get("status") or data.get("task_status") or (
                    data.get("output", {}).get("task_status", ""))).lower()

                if task_id and status in ["pending", "processing", "submitted", "in_progress", "queued"]:
                    if is_dashscope:
                        poll_endpoint = f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"
                    else:
                        poll_endpoint = f"{endpoint}/{task_id}"

                    max_attempts = 60
                    for attempt in range(max_attempts):
                        await asyncio.sleep(10)

                        poll_resp = await client.get(poll_endpoint, headers=headers)
                        poll_resp.raise_for_status()
                        poll_data = poll_resp.json()

                        current_status = str(poll_data.get("status") or poll_data.get("task_status") or (
                            poll_data.get("output", {}).get("task_status", ""))).lower()

                        if current_status in ["succeeded", "success", "completed"]:
                            data = poll_data
                            break
                        elif current_status in ["failed", "error", "cancelled"]:
                            error_msg = poll_data.get("output", {}).get("message", str(poll_data))
                            return {"success": False, "error": f"异步任务执行失败: {error_msg}"}
                    else:
                        return {"success": False, "error": f"任务超时 (超过10分钟未出结果): {task_id}"}

                # ================= 4. 结果提取清洗 =================
                if req_type in ["image", "video"]:
                    if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
                        content = data["data"][0].get("url") or data["data"][0].get("b64_json")
                    elif "output" in data:
                        # 阿里 DashScope 原生结果解析
                        if "results" in data["output"] and len(data["output"]["results"]) > 0:
                            content = data["output"]["results"][0].get("video_url") or data["output"]["results"][0].get(
                                "url")
                        else:
                            content = data["output"].get("video_url") or data["output"].get("url") or data[
                                "output"].get("image_url")
                    elif "video_result" in data:
                        content = data["video_result"][0].get("url")
                    elif "choices" in data:
                        content = data["choices"][0]["message"]["content"]
                    else:
                        content = str(data)
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