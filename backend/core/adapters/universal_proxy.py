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
    🔥 真正实现了配置驱动路由，告别硬编码补丁！
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

        # 1. 基础鉴权头注入
        if self.api_key and self.api_key.key:
            auth_type = self.provider.auth_type.lower()
            if auth_type == "bearer":
                headers["Authorization"] = f"Bearer {self.api_key.key}"
            elif auth_type == "x-api-key":
                headers["x-api-key"] = self.api_key.key

        # 🌟 2. 终极灵活性：无脑合并用户在界面的自定义 Header！(如 X-DashScope-Async 等)
        if self.provider.custom_headers:
            headers.update(self.provider.custom_headers)

        return headers

    def _get_endpoint(self, req_type: str) -> str:
        """🌟 核心跃迁：基于高级配置动态计算端点"""
        # 1. 优先读取并应用 UI 上的自定义路由覆盖
        if self.provider.endpoints and self.provider.endpoints.get(req_type):
            custom_ep = self.provider.endpoints[req_type]
            # 如果是 http 开头的绝对路径，直接使用；否则拼接 base_url
            return custom_ep if custom_ep.startswith("http") else f"{self.base_url}{custom_ep}"

        # 2. 没有覆盖时，走默认的 OpenAI 标准后缀
        default_paths = {
            "chat": "/chat/completions",
            "image": "/images/generations",
            "video": "/videos/generations"
        }
        return f"{self.base_url}{default_paths.get(req_type, '/chat/completions')}"

    def _build_payload(self, request_params: Dict[str, Any], req_type: str, endpoint: str) -> Dict[str, Any]:
        """根据端点特征和模态，组装最终 Payload"""
        model_name = request_params.get("model")
        payload = {"model": model_name}

        # 🌟 智能方言推断：通过判断端点 URL，自动转换为原生格式 (比如阿里视频的特殊结构)
        if "dashscope.aliyuncs.com/api/v1/services" in endpoint:
            payload["input"] = {"prompt": request_params.get("prompt", "")}
            payload["parameters"] = {}
            if "image_url" in request_params:
                payload["input"]["img_url"] = request_params["image_url"]
            if req_type == "image":
                payload["parameters"]["size"] = request_params.get("size", "1024*1024").replace("x", "*")
            return payload

        # 标准 OpenAI 格式组装
        if req_type in ["image", "video"]:
            payload["prompt"] = request_params.get("prompt", "")
            if "size" in request_params and req_type == "image":
                payload["size"] = request_params["size"]
            if "image_url" in request_params:
                payload["image_url"] = request_params["image_url"]
        else:
            messages = request_params.get("messages", [])
            if not messages and "prompt" in request_params:
                messages = [{"role": "user", "content": request_params["prompt"]}]
            payload["messages"] = messages

        return payload

    async def generate(self, request_params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.base_url:
            return {"success": False, "error": f"Provider [{self.provider.id}] 没有配置基础网关"}

        req_type = request_params.get("type", "text")
        endpoint = self._get_endpoint(req_type)
        headers = self._build_headers()
        payload = self._build_payload(request_params, req_type, endpoint)

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # ================= 1. 提交初始请求 =================
                response = await client.post(endpoint, headers=headers, json=payload)

                # 🌟 终极容错降级：如果非原生路由报 404 (说明中转站魔改了画图接口到聊天里)
                if response.status_code == 404 and req_type in ["image", "video"] and "dashscope" not in endpoint:
                    fallback_endpoint = self._get_endpoint("chat")
                    fallback_payload = {
                        "model": payload.get("model"),
                        "messages": [{"role": "user", "content": request_params.get("prompt", "Please generate")}],
                    }
                    response = await client.post(fallback_endpoint, headers=headers, json=fallback_payload)

                response.raise_for_status()
                data = response.json()

                # ================= 2. 自动嗅探异步轮询 =================
                # 兼容标准和原生嵌套的 task_id
                task_id = data.get("task_id") or data.get("id")
                if "output" in data and "task_id" in data["output"]:
                    task_id = data["output"]["task_id"]

                status = str(data.get("status") or data.get("task_status") or (
                    data.get("output", {}).get("task_status", ""))).lower()

                if task_id and status in ["pending", "processing", "submitted", "in_progress", "queued"]:
                    # 动态推算轮询端点
                    if "dashscope.aliyuncs.com/api/v1/services" in endpoint:
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

                # ================= 3. 结果统一清洗 =================
                if req_type in ["image", "video"]:
                    if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
                        content = data["data"][0].get("url") or data["data"][0].get("b64_json")
                    elif "output" in data:
                        if "results" in data["output"] and len(data["output"]["results"]) > 0:
                            content = data["output"]["results"][0].get("video_url") or data["output"]["results"][0].get(
                                "url")
                        else:
                            content = data["output"].get("video_url") or data["output"].get("url") or data[
                                "output"].get("image_url")
                    elif "video_result" in data:
                        content = data["video_result"][0].get("url")
                    elif "choices" in data:  # 兼容从聊天接口截获的图片链接
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