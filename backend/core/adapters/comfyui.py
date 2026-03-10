# backend/core/adapters/comfyui.py
import asyncio
import httpx
import json
import urllib.parse
from typing import Dict, Any
from .base import BaseAdapter
from backend.core.registry import ProviderRegistry
from backend.models.provider import Provider
from backend.models.api_key import APIKey


# 🌟 注册一个通用的 ComfyUI 引擎标识，供工厂调用
@ProviderRegistry.register_adapter("base_comfyui")
class ComfyUIAdapter(BaseAdapter):
    """
    大一统的 ComfyUI 物理引擎适配器 (完全拥抱配置驱动架构)
    """

    def __init__(self, provider: Provider, api_key: APIKey = None):
        self.provider = provider
        self.api_key = api_key

    # 统一的标准字典传参
    async def generate(self, request_params: Dict[str, Any]) -> Dict[str, Any]:
        prompt = request_params.get("prompt")
        req_type = request_params.get("type", "image")

        # 1. 动态构建真正的 API 地址
        base_url = self.api_key.base_url if self.api_key and self.api_key.base_url else self.provider.default_base_url
        api_key_value = self.api_key.key if self.api_key else ""

        if base_url and "runninghub" in str(base_url).lower():
            is_plus = request_params.get("instanceType") == "plus"
            proxy_path = "proxy-plus" if is_plus else "proxy"
            actual_base_url = f"https://www.runninghub.cn/{proxy_path}/{api_key_value}"
        else:
            # 本地局域网兜底
            actual_base_url = (base_url or "http://127.0.0.1:8188").rstrip('/')

        prompt_url = f"{actual_base_url}/prompt"
        history_url = f"{actual_base_url}/history"

        # 2. 剥离 JSON 外壳
        try:
            parsed_prompt = json.loads(prompt) if isinstance(prompt, str) else prompt
            actual_workflow = parsed_prompt.get("workflow_json", parsed_prompt) if isinstance(parsed_prompt,
                                                                                              dict) else parsed_prompt
        except Exception:
            return {"success": False, "error": "提交给 ComfyUI 的 prompt 必须是有效的 Workflow JSON"}

        payload = {"prompt": actual_workflow}

        async with httpx.AsyncClient() as client:
            try:
                print(f"🚀 [ComfyUI Engine] 提交任务至: {prompt_url}")
                submit_res = await client.post(prompt_url, json=payload, timeout=15.0)
                submit_res.raise_for_status()

                prompt_id = submit_res.json().get("prompt_id")
                if not prompt_id:
                    return {"success": False, "error": "未能从物理引擎获取到 prompt_id"}

                print(f"✅ [ComfyUI Engine] 提交成功 | Prompt ID: {prompt_id} | 开始轮询...")

                # 轮询执行结果
                for _ in range(120):  # 最长等待约 6 分钟
                    await asyncio.sleep(3)
                    history_res = await client.get(f"{history_url}/{prompt_id}", timeout=10.0)

                    if history_res.status_code == 200:
                        history_data = history_res.json()
                        if prompt_id in history_data:
                            print(f"🎉 [ComfyUI Engine] 渲染完成！")
                            outputs = history_data[prompt_id].get("outputs", {})

                            # 🌟 智能提取最终渲染的图片或视频 URL
                            media_url = None
                            for node_id, output in outputs.items():
                                # 1. 优先尝试提取视频 (VHS_VideoCombine 节点通常输出 gifs)
                                if "gifs" in output and len(output["gifs"]) > 0:
                                    media_info = output["gifs"][0]
                                    filename = urllib.parse.quote(media_info.get("filename", ""))
                                    subfolder = urllib.parse.quote(media_info.get("subfolder", ""))
                                    folder_type = media_info.get("type", "output")
                                    media_url = f"{actual_base_url}/view?filename={filename}&subfolder={subfolder}&type={folder_type}"
                                    req_type = "video"  # 强制覆盖媒体类型为视频
                                    break
                                # 2. 如果没有视频，再尝试提取图片 (SaveImage 节点)
                                elif "images" in output and len(output["images"]) > 0:
                                    img_info = output["images"][0]
                                    filename = urllib.parse.quote(img_info.get("filename", ""))
                                    subfolder = urllib.parse.quote(img_info.get("subfolder", ""))
                                    folder_type = img_info.get("type", "output")
                                    media_url = f"{actual_base_url}/view?filename={filename}&subfolder={subfolder}&type={folder_type}"
                                    req_type = "image"
                                    break

                            return {
                                "success": True,
                                "type": req_type,  # 动态返回媒体类型给前端
                                "content": media_url if media_url else str(outputs),
                                "raw_response": history_data[prompt_id]
                            }

                return {"success": False, "error": "ComfyUI 渲染超时，请检查终端"}
            except Exception as e:
                return {"success": False, "error": f"网络通信异常 (目标: {actual_base_url}): {str(e)}"}