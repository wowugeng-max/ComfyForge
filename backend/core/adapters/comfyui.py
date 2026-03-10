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
from backend.core.ws import manager


@ProviderRegistry.register_adapter("base_comfyui")
class ComfyUIAdapter(BaseAdapter):
    """
    大一统的 ComfyUI 物理引擎适配器
    设计哲学：绝对的配置驱动。页面配置了什么 URL，就请求什么 URL。不做任何硬编码兜底。
    """

    def __init__(self, provider: Provider, api_key: APIKey = None):
        self.provider = provider
        self.api_key = api_key

    async def generate(self, request_params: Dict[str, Any]) -> Dict[str, Any]:
        prompt = request_params.get("prompt")
        req_type = request_params.get("type", "image")
        client_id = request_params.get("client_id")  # 获取发出请求的节点 ID

        # 🌟 定义专属广播喇叭
        async def notify(text):
            if client_id:
                await manager.send_message({"type": "status", "message": text}, client_id)

        # 🌟 1. 绝对纯粹的寻址逻辑：优先用 Key 的自定义网关，否则用厂商的默认网关
        base_url = None
        if self.api_key and self.api_key.base_url:
            base_url = self.api_key.base_url
        elif self.provider and self.provider.default_base_url:
            base_url = self.provider.default_base_url

        # 🌟 2. 拒绝兜底：如果完全没配，直接打回，倒逼用户去页面配置
        if not base_url:
            error_msg = f"未配置算力网关！请前往 [凭证管理] 页面正确填写 Base URL。"
            await notify(f"❌ 启动失败: {error_msg}")
            return {"success": False, "error": error_msg}

        # 🌟 3. 严格遵循页面配置
        actual_base_url = str(base_url).strip().rstrip('/')
        api_key_value = self.api_key.key if self.api_key else ""

        # （仅保留：针对 RunningHub 这种必须把 Key 拼在 URL 路径里的特殊云端中转站做兼容）
        if "runninghub" in actual_base_url.lower() and api_key_value and not actual_base_url.endswith(api_key_value):
            actual_base_url = f"{actual_base_url}/{api_key_value}"

        prompt_url = f"{actual_base_url}/prompt"
        history_url = f"{actual_base_url}/history"

        try:
            parsed_prompt = json.loads(prompt) if isinstance(prompt, str) else prompt
            actual_workflow = parsed_prompt.get("workflow_json", parsed_prompt) if isinstance(parsed_prompt,
                                                                                              dict) else parsed_prompt
        except Exception:
            return {"success": False, "error": "提交给 ComfyUI 的 prompt 必须是有效的 Workflow JSON"}

        payload = {"prompt": actual_workflow}

        await notify(f"📦 正在连接算力网关: {actual_base_url} ...")

        async with httpx.AsyncClient() as client:
            try:
                print(f"🚀 [ComfyUI Engine] 提交任务至: {prompt_url}")
                submit_res = await client.post(prompt_url, json=payload, timeout=15.0)

                # 🌟 捕捉 400 错误：机器连上了，但工作流缺节点
                if submit_res.status_code != 200:
                    error_msg = submit_res.text
                    try:
                        error_json = submit_res.json()
                        if "error" in error_json:
                            err_obj = error_json.get("error", {})
                            error_msg = err_obj.get("message", str(err_obj)) if isinstance(err_obj, dict) else str(
                                err_obj)
                            if "node_errors" in error_json:
                                error_msg += f" | 缺失/错误节点: {list(error_json.get('node_errors').keys())}"
                    except Exception:
                        pass
                    return {"success": False, "error": f"引擎拒收 (可能缺插件): {error_msg}"}

                submit_res.raise_for_status()

                prompt_id = submit_res.json().get("prompt_id")
                if not prompt_id:
                    return {"success": False, "error": "未能从物理引擎获取到 prompt_id"}

                await notify(f"🔥 算力已响应！任务 ID {prompt_id[:6]} 开始渲染...")

                for i in range(1200):
                    await asyncio.sleep(5)

                    if i % 2 == 0:
                        await notify(f"⚡ GPU 计算中... (已耗时 {i * 5} 秒)")

                    history_res = await client.get(f"{history_url}/{prompt_id}", timeout=10.0)

                    if history_res.status_code == 200:
                        history_data = history_res.json()
                        if prompt_id in history_data:
                            print(f"🎉 [ComfyUI Engine] 渲染完成！")
                            outputs = history_data[prompt_id].get("outputs", {})

                            media_url = None
                            for node_id, output in outputs.items():
                                if "gifs" in output and len(output["gifs"]) > 0:
                                    media_info = output["gifs"][0]
                                    filename = urllib.parse.quote(media_info.get("filename", ""))
                                    subfolder = urllib.parse.quote(media_info.get("subfolder", ""))
                                    folder_type = media_info.get("type", "output")
                                    media_url = f"{actual_base_url}/view?filename={filename}&subfolder={subfolder}&type={folder_type}"
                                    req_type = "video"
                                    break
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
                                "type": req_type,
                                "content": media_url if media_url else str(outputs),
                                "raw_response": history_data[prompt_id]
                            }

                return {"success": False, "error": "ComfyUI 渲染超时 (已超 100 分钟)"}

            except httpx.ConnectError as ce:
                # 🌟 捕捉无法连接异常：IP填错、端口没开、或者机器没开机
                error_str = f"网络通信失败 (请检查网关 {actual_base_url} 是否存活)"
                await notify(f"❌ {error_str}")
                return {"success": False, "error": error_str}
            except Exception as e:
                # 🌟 捕捉其他异常并直接抛给前端
                error_str = f"请求异常: {str(e)}"
                await notify(f"❌ {error_str}")
                return {"success": False, "error": error_str}