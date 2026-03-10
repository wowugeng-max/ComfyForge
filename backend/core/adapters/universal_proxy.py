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
    极致纯净版配置驱动引擎 (Pure Config-Driven)
    🌟 支持模态级的局部 Header 注入，完美解决大厂同步/异步混合接口冲突！
    """

    def __init__(self, provider: Provider, api_key: APIKey = None):
        self.provider = provider
        self.api_key = api_key
        self.base_url = (
            self.api_key.base_url if self.api_key and self.api_key.base_url else self.provider.default_base_url)
        if self.base_url and self.base_url.endswith("/"):
            self.base_url = self.base_url[:-1]

    def _build_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key and self.api_key.key:
            auth_type = self.provider.auth_type.lower()
            if auth_type == "bearer":
                headers["Authorization"] = f"Bearer {self.api_key.key}"
            elif auth_type == "x-api-key":
                headers["x-api-key"] = self.api_key.key

        # 全局 Header
        if self.provider.custom_headers:
            headers.update(self.provider.custom_headers)
        return headers

    def _get_route_config(self, req_type: str) -> Union[str, Dict[str, Any]]:
        if self.provider.endpoints and self.provider.endpoints.get(req_type):
            return self.provider.endpoints[req_type]

        if self.provider.endpoints:
            fallback_type = "image" if "image" in req_type else ("video" if "video" in req_type else None)
            if fallback_type and self.provider.endpoints.get(fallback_type):
                return self.provider.endpoints[fallback_type]

        return ""

    def _render_template(self, template: Any, params: Dict[str, Any]) -> Any:
        if isinstance(template, dict):
            rendered = {}
            for k, v in template.items():
                val = self._render_template(v, params)
                if val is not None:
                    rendered[k] = val
            return rendered
        elif isinstance(template, list):
            return [self._render_template(item, params) for item in template if
                    self._render_template(item, params) is not None]
        elif isinstance(template, str):
            stripped = template.strip()
            if stripped.startswith("{{") and stripped.endswith("}}"):
                key = stripped[2:-2].strip()
                val = params.get(key)
                if key == "size" and val and isinstance(val, str):
                    return val.replace("x", "*") if "*" not in val else val
                return val
            return template
        return template

    def _build_payload(self, request_params: Dict[str, Any], req_type: str, route_config: Union[str, Dict[str, Any]]) -> \
    Dict[str, Any]:
        # 1. 🌟 DSL 模式：将所有动态参数无缝注入上下文
        if isinstance(route_config, dict) and "payload_template" in route_config:
            # 复制所有的请求参数作为上下文（包含了 seed, size, prompt_extend 等所有你在前端填的值）
            context = dict(request_params)

            # 补全可能缺失的基础默认值
            context.setdefault("size", "1024*1024")
            if "prompt" not in context:
                context["prompt"] = ""

            return self._render_template(route_config["payload_template"], context)

        # 2. 🌟 标准 OpenAI 模式兜底：动态合并所有额外参数
        payload = {}

        # 把所有的额外动态参数 (如 temperature, max_tokens, seed) 全塞进 payload
        for k, v in request_params.items():
            if k not in ["type", "image_url", "messages", "prompt", "model"]:
                payload[k] = v

        payload["model"] = request_params.get("model")
        is_image_or_video = req_type in ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "image",
                                         "video"]

        if is_image_or_video:
            payload["prompt"] = request_params.get("prompt", "")
            if "image_url" in request_params:
                payload["image_url"] = request_params["image_url"]
        else:
            messages = request_params.get("messages", [])
            if not messages and request_params.get("prompt"):
                messages = [{"role": "user", "content": request_params["prompt"]}]
            payload["messages"] = messages

        return payload

    def _extract_value_by_path(self, data: Dict[str, Any], path: str) -> Any:
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
            return {"success": False, "error": f"Provider [{self.provider.id}] 未配置基础网关"}

        req_type = request_params.get("type", "text")
        route_config = self._get_route_config(req_type)
        headers = self._build_headers()

        # 🌟 核心修复点：如果有路由级别的局部 Header，在这里覆盖注入！
        if isinstance(route_config, dict) and "headers" in route_config:
            headers.update(route_config["headers"])

        endpoint_suffix = route_config.get("url", "") if isinstance(route_config, dict) else str(route_config)

        # 智能兜底 OpenAI 后缀
        if not endpoint_suffix or endpoint_suffix.strip() in ["", "/"]:
            defaults = {
                "chat": "/chat/completions", "vision": "/chat/completions",
                "text_to_image": "/images/generations", "image_to_image": "/images/generations",
                "text_to_video": "/videos/generations", "image_to_video": "/videos/generations"
            }
            endpoint_suffix = defaults.get(req_type, "/chat/completions")

        endpoint = endpoint_suffix if endpoint_suffix.startswith("http") else f"{self.base_url}{endpoint_suffix}"
        payload = self._build_payload(request_params, req_type, route_config)
        is_image_or_video = req_type in ["image", "video", "text_to_image", "image_to_image", "text_to_video",
                                         "image_to_video"]

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(endpoint, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()

                task_id = None
                status = None

                if isinstance(route_config, dict) and "task_id_extractor" in route_config:
                    task_id = self._extract_value_by_path(data, route_config["task_id_extractor"])
                    status = str(self._extract_value_by_path(data, route_config.get("status_extractor",
                                                                                    "output.task_status"))).lower()
                else:
                    task_id = data.get("task_id") or data.get("id") or (data.get("output") or {}).get("task_id")
                    status = str(data.get("status") or data.get("task_status") or (
                        data.get("output", {}).get("task_status", ""))).lower()

                if task_id and status in ["pending", "processing", "submitted", "in_progress", "queued"]:
                    poll_url_template = route_config.get("poll_url") if isinstance(route_config, dict) else None
                    if poll_url_template:
                        poll_endpoint = poll_url_template.replace("{{task_id}}", str(task_id))
                    else:
                        poll_endpoint = f"{endpoint}/{task_id}"

                    max_attempts = 60
                    for _ in range(max_attempts):
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
                            return {"success": False, "error": f"异步执行失败: {error_msg}"}
                    else:
                        return {"success": False, "error": f"任务超时: {task_id}"}

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

                return {"success": True, "type": req_type, "content": content, "raw_response": data}

            except httpx.HTTPStatusError as e:
                return {"success": False,
                        "error": f"HTTP {e.response.status_code} 拒绝访问 [{endpoint}]: {e.response.text}"}
            except Exception as e:
                return {"success": False, "error": f"请求异常 [{endpoint}]: {str(e)}"}