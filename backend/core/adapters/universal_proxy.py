# backend/core/adapters/universal_proxy.py
import httpx
import asyncio
from typing import Dict, Any, Union
from .base import BaseAdapter
from backend.core.registry import ProviderRegistry
from backend.models.provider import Provider
from backend.models.api_key import APIKey


@ProviderRegistry.register_adapter("universal_openai")
class UniversalProxyAdapter(BaseAdapter):
    """
    万能大模型适配器 (DSL Protocol-Driven)
    🔥 Phase 9.5 终极进化：基于模板渲染的配置驱动引擎！彻底消灭硬编码！
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

        # 🌟 2. 终极灵活性：无脑合并用户在界面的自定义 Header
        if self.provider.custom_headers:
            headers.update(self.provider.custom_headers)

        return headers

    def _get_route_config(self, req_type: str) -> Union[str, Dict[str, Any]]:
        """🌟 核心跃迁：获取当前模态的路由配置 (支持旧版字符串和新版 DSL 对象)"""
        if self.provider.endpoints and self.provider.endpoints.get(req_type):
            return self.provider.endpoints[req_type]

        # 向下兼容降级：如果界面上只配了粗犷的 "image" 或 "video"
        if self.provider.endpoints:
            fallback_type = "image" if "image" in req_type else ("video" if "video" in req_type else None)
            if fallback_type and self.provider.endpoints.get(fallback_type):
                return self.provider.endpoints[fallback_type]

        # 默认标准端点
        default_paths = {
            "chat": "/chat/completions",
            "vision": "/chat/completions",
            "text_to_image": "/images/generations",
            "image_to_image": "/images/generations",
            "text_to_video": "/videos/generations",
            "image_to_video": "/videos/generations",
            "image": "/images/generations",
            "video": "/videos/generations"
        }
        return default_paths.get(req_type, "/chat/completions")

    def _render_template(self, template: Any, params: Dict[str, Any]) -> Any:
        """🚀 极轻量级递归模板渲染器"""
        if isinstance(template, dict):
            rendered = {}
            for k, v in template.items():
                val = self._render_template(v, params)
                # 如果参数值为 None（如未传图片），自动裁减掉这个键，避免大厂校验报错
                if val is not None:
                    rendered[k] = val
            return rendered
        elif isinstance(template, list):
            return [self._render_template(item, params) for item in template if
                    self._render_template(item, params) is not None]
        elif isinstance(template, str) and template.startswith("{{") and template.endswith("}}"):
            key = template[2:-2].strip()
            val = params.get(key)
            if key == "size" and val:
                return val.replace("x", "*")  # 尺寸兼容符转换
            return val
        return template

    def _build_payload(self, request_params: Dict[str, Any], req_type: str, route_config: Union[str, Dict[str, Any]]) -> \
    Dict[str, Any]:
        """根据 DSL 模板或标准特征，组装最终 Payload"""
        # 1. 🌟 如果配置了高级 DSL 模板，彻底交由模板引擎渲染
        if isinstance(route_config, dict) and "payload_template" in route_config:
            context = {
                "model": request_params.get("model"),
                "prompt": request_params.get("prompt", ""),
                "image_url": request_params.get("image_url"),
                "size": request_params.get("size", "1024x1024"),
                "messages": request_params.get("messages")
            }
            return self._render_template(route_config["payload_template"], context)

        # 2. 兜底：标准 OpenAI 格式组装
        model_name = request_params.get("model")
        payload = {"model": model_name}
        is_image_or_video = req_type in ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "image",
                                         "video"]

        if is_image_or_video:
            payload["prompt"] = request_params.get("prompt", "")
            if "size" in request_params:
                payload["size"] = request_params["size"]
            if "image_url" in request_params:
                payload["image_url"] = request_params["image_url"]
        else:
            messages = request_params.get("messages", [])
            if not messages and "prompt" in request_params:
                messages = [{"role": "user", "content": request_params["prompt"]}]
            payload["messages"] = messages

        return payload

    def _extract_value_by_path(self, data: Dict[str, Any], path: str) -> Any:
        """基于点表示法(如 output.task_id)提取字典中的值"""
        keys = path.split('.')
        val = data
        for key in keys:
            if isinstance(val, dict) and key in val:
                val = val[key]
            elif isinstance(val, list) and key.isdigit() and int(key) < len(val):
                val = val[int(key)]
            else:
                return None
        return val

    async def generate(self, request_params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.base_url:
            return {"success": False, "error": f"Provider [{self.provider.id}] 没有配置基础网关"}

        req_type = request_params.get("type", "text")
        route_config = self._get_route_config(req_type)
        headers = self._build_headers()

        # 解析端点 URL
        endpoint_suffix = route_config.get("url", "") if isinstance(route_config, dict) else route_config
        endpoint = endpoint_suffix if endpoint_suffix.startswith("http") else f"{self.base_url}{endpoint_suffix}"

        payload = self._build_payload(request_params, req_type, route_config)
        is_image_or_video = req_type in ["image", "video", "text_to_image", "image_to_image", "text_to_video",
                                         "image_to_video"]

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(endpoint, headers=headers, json=payload)

                # 🌟 终极容错降级：如果非原生路由报 404
                if response.status_code == 404 and is_image_or_video and "dashscope" not in endpoint:
                    fallback_config = self._get_route_config("chat")
                    fallback_suffix = fallback_config.get("url", "") if isinstance(fallback_config,
                                                                                   dict) else fallback_config
                    fallback_ep = fallback_suffix if fallback_suffix.startswith(
                        "http") else f"{self.base_url}{fallback_suffix}"

                    fallback_payload = {
                        "model": payload.get("model"),
                        "messages": [{"role": "user", "content": request_params.get("prompt", "Please generate")}],
                    }
                    response = await client.post(fallback_ep, headers=headers, json=fallback_payload)
                    endpoint = fallback_ep  # 更新供异常报错用

                response.raise_for_status()
                data = response.json()

                # ================= 动态结果解析与轮询 =================
                task_id = None
                status = None

                # 若配置了 DSL 提取器
                if isinstance(route_config, dict) and "task_id_extractor" in route_config:
                    task_id = self._extract_value_by_path(data, route_config["task_id_extractor"])
                    status = str(self._extract_value_by_path(data, route_config.get("status_extractor",
                                                                                    "output.task_status"))).lower()
                else:
                    task_id = data.get("task_id") or data.get("id") or (data.get("output") or {}).get("task_id")
                    status = str(data.get("status") or data.get("task_status") or (
                        data.get("output", {}).get("task_status", ""))).lower()

                if task_id and status in ["pending", "processing", "submitted", "in_progress", "queued"]:
                    poll_endpoint = f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}" if "dashscope" in endpoint else f"{endpoint}/{task_id}"

                    max_attempts = 60
                    for attempt in range(max_attempts):
                        await asyncio.sleep(10)
                        poll_resp = await client.get(poll_endpoint, headers=headers)
                        poll_resp.raise_for_status()
                        poll_data = poll_resp.json()

                        if isinstance(route_config, dict) and "status_extractor" in route_config:
                            current_status = str(
                                self._extract_value_by_path(poll_data, route_config["status_extractor"])).lower()
                        else:
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

                # ================= 提取最终内容 =================
                content = str(data)
                if isinstance(route_config, dict) and "result_extractor" in route_config:
                    content = self._extract_value_by_path(data, route_config["result_extractor"])
                elif is_image_or_video:
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
                    elif "choices" in data:
                        content = data["choices"][0]["message"]["content"]
                else:
                    if "choices" in data:
                        content = data["choices"][0]["message"]["content"]

                return {
                    "success": True,
                    "type": req_type,
                    "content": content,
                    "raw_response": data
                }
            except httpx.HTTPStatusError as e:
                return {"success": False,
                        "error": f"HTTP {e.response.status_code} 拒绝访问网关 [{endpoint}]: {e.response.text}"}
            except Exception as e:
                return {"success": False, "error": f"请求异常 [{endpoint}]: {str(e)}"}