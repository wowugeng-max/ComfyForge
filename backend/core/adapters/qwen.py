# backend/core/adapters/qwen.py
import asyncio
import httpx
import base64
import json
from urllib.parse import urlparse
from typing import Dict, Any, Optional
from backend.core.adapters.base import BaseAdapter
from backend.core.registry import ProviderRegistry


@ProviderRegistry.register_adapter("qwen")
class QwenAdapter(BaseAdapter):

    async def generate(self, api_key: str, model_name: str, prompt: str, type: str, extra_params: Dict[str, Any],
                       base_url: Optional[str] = None) -> Dict[str, Any]:
        actual_base_url = (base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip('/')

        async with httpx.AsyncClient() as client:
            # ==========================================
            # 1. 通用文本/对话生成 (聊天逻辑)
            # ==========================================
            if type in ["chat", "text", "prompt"]:
                chat_url = f"{actual_base_url}/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }

                try:
                    messages = json.loads(prompt) if isinstance(prompt, str) else prompt
                    if not isinstance(messages, list):
                        messages = [{"role": "user", "content": str(prompt)}]
                except Exception:
                    messages = [{"role": "user", "content": prompt}]

                payload = {
                    "model": model_name or "qwen-plus",
                    "messages": messages,
                    **extra_params
                }

                resp = await client.post(chat_url, json=payload, headers=headers, timeout=60.0)
                if resp.status_code != 200:
                    raise RuntimeError(f"千问文本生成失败 (HTTP {resp.status_code}): {resp.text}")
                data = resp.json()
                return {"type": "text", "content": data["choices"][0]["message"]["content"]}

            # ==========================================
            # 2. 图像生成 (智能路由多通道)
            # ==========================================
            elif type == "image":
                if not prompt:
                    raise ValueError("生成图片必须提供文本提示词(prompt)")

                # 🌟 核心防呆：智能提取纯文本提示词
                # 防止前端传过来的是多模态 JSON 数组，导致阿里云把它当成了错误的 Image URL 报错
                text_prompt = prompt
                try:
                    parsed_prompt = json.loads(prompt)
                    if isinstance(parsed_prompt, list):
                        # 从混合数组中只挑出 "text" 类型的数据拼在一起
                        texts = [item.get("text", "") for item in parsed_prompt if
                                 item.get("type") == "text" or "text" in item]
                        text_prompt = " ".join(texts).strip()
                        if not text_prompt:
                            raise ValueError("多模态输入中未找到纯文本提示词")
                except Exception:
                    pass  # 如果不是 JSON 数组，保持原样作为字符串

                model_to_use = model_name or "wanx-v1"
                model_lower = model_to_use.lower()
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }

                if "dashscope.aliyuncs.com" in actual_base_url:
                    dashscope_url = actual_base_url.replace("compatible-mode/v1", "api/v1")
                else:
                    parsed = urlparse(actual_base_url)
                    dashscope_url = f"{parsed.scheme}://{parsed.netloc}/api/v1"

                # ==========================================
                # 通道 A: 针对 z-image-turbo 和 qwen-image 的原生同步接口 (重塑你原本的通道)
                # ==========================================
                if "qwen-image" in model_lower or "z-image" in model_lower:
                    gen_url = f"{dashscope_url}/services/aigc/multimodal-generation/generation"
                    payload = {
                        "model": model_to_use,
                        "input": {
                            "messages": [{"role": "user", "content": [{"text": text_prompt}]}]
                        },
                        "parameters": {}
                    }
                    if "size" in extra_params: payload["parameters"]["size"] = extra_params["size"]
                    if "seed" in extra_params: payload["parameters"]["seed"] = extra_params["seed"]

                    resp = await client.post(gen_url, json=payload, headers=headers, timeout=120.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        try:
                            image_url = data["output"]["choices"][0]["message"]["content"][0]["image"]
                            img_resp = await client.get(image_url, timeout=60.0)
                            img_resp.raise_for_status()
                            img_b64 = base64.b64encode(img_resp.content).decode()
                            return {"type": "image", "content": f"data:image/png;base64,{img_b64}"}
                        except Exception:
                            raise RuntimeError(f"解析千问同步生图结果失败: {data}")
                    else:
                        raise RuntimeError(f"千问同步生图失败: {resp.text}")

                # ==========================================
                # 通道 B: 针对 wanx-v1 的原生异步任务接口
                # ==========================================
                elif "wanx" in model_lower:
                    submit_url = f"{dashscope_url}/services/aigc/text2image/image-synthesis"
                    headers["X-DashScope-Async"] = "enable"

                    native_params = {}
                    if "size" in extra_params: native_params["size"] = extra_params["size"]
                    if "n" in extra_params: native_params["n"] = extra_params["n"]
                    if "seed" in extra_params: native_params["seed"] = extra_params["seed"]

                    async_payload = {
                        "model": model_to_use,
                        "input": {"prompt": text_prompt},
                        "parameters": native_params
                    }

                    submit_res = await client.post(submit_url, json=async_payload, headers=headers, timeout=30.0)
                    if submit_res.status_code != 200:
                        raise RuntimeError(f"万相生图提交失败: {submit_res.text}")

                    task_id = submit_res.json().get("output", {}).get("task_id")
                    check_url = f"{dashscope_url}/tasks/{task_id}"

                    for _ in range(60):
                        await asyncio.sleep(3)
                        poll_res = await client.get(check_url, headers={"Authorization": f"Bearer {api_key}"},
                                                    timeout=10.0)
                        if poll_res.status_code == 200:
                            poll_data = poll_res.json()
                            status = poll_data.get("output", {}).get("task_status")
                            if status == "SUCCEEDED":
                                img_url = poll_data["output"]["results"][0]["url"]
                                img_resp = await client.get(img_url, timeout=60.0)
                                img_b64 = base64.b64encode(img_resp.content).decode()
                                return {"type": "image", "content": f"data:image/png;base64,{img_b64}"}
                            elif status in ["FAILED", "CANCELED"]:
                                raise RuntimeError(f"万相生图失败: {poll_data.get('output', {}).get('message')}")

                    raise RuntimeError("万相生图超时")

                # ==========================================
                # 通道 C: 通用兜底 (OpenAI 兼容协议)
                # ==========================================
                else:
                    gen_url = f"{actual_base_url}/images/generations"
                    payload = {"model": model_to_use, "prompt": text_prompt}
                    if "size" in extra_params: payload["size"] = extra_params["size"]

                    resp = await client.post(gen_url, json=payload, headers=headers, timeout=60.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        img_item = data.get("data", [{}])[0]
                        if "b64_json" in img_item:
                            return {"type": "image", "content": f"data:image/png;base64,{img_item['b64_json']}"}
                        elif "url" in img_item:
                            img_resp = await client.get(img_item["url"], timeout=60.0)
                            img_b64 = base64.b64encode(img_resp.content).decode()
                            return {"type": "image", "content": f"data:image/png;base64,{img_b64}"}
                    raise RuntimeError(f"生图请求失败: {resp.text}")