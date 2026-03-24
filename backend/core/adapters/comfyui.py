# backend/core/adapters/comfyui.py
import asyncio
import httpx
import json
import base64
import uuid
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
        # 🌟 新增：追踪状态与网关地址，用于 interrupt 方法
        self._is_interrupted = False
        self._current_base_url = None

    # 🌟 新增：真正的物理级释放 GPU 方法
    async def interrupt(self) -> bool:
        self._is_interrupted = True
        if not self._current_base_url:
            return False

        try:
            # 向局域网或云端物理机发送真实的 /interrupt 请求
            interrupt_url = f"{self._current_base_url}/interrupt"
            print(f"🛑 [ComfyUI Engine] 正在强行中断显存计算: {interrupt_url}")
            async with httpx.AsyncClient() as client:
                res = await client.post(interrupt_url, timeout=5.0)
                return res.status_code == 200
        except Exception as e:
            print(f"⚠️ [ComfyUI Engine] 物理机释放指令发送失败: {e}")
            return False

    async def generate(self, request_params: Dict[str, Any]) -> Dict[str, Any]:
        prompt = request_params.get("prompt")
        req_type = request_params.get("type", "image")
        client_id = request_params.get("client_id")

        async def notify(text):
            if client_id:
                await manager.send_message({"type": "status", "message": text}, client_id)

        base_url = None
        if self.api_key and self.api_key.base_url:
            base_url = self.api_key.base_url
        elif self.provider and self.provider.default_base_url:
            base_url = self.provider.default_base_url

        if not base_url:
            error_msg = f"未配置算力网关！请前往 [凭证管理] 页面正确填写 Base URL。"
            await notify(f"❌ 启动失败: {error_msg}")
            return {"success": False, "error": error_msg}

        actual_base_url = str(base_url).strip().rstrip('/')
        api_key_value = self.api_key.key if self.api_key else ""

        if "runninghub" in actual_base_url.lower() and api_key_value and not actual_base_url.endswith(api_key_value):
            actual_base_url = f"{actual_base_url}/{api_key_value}"

        prompt_url = f"{actual_base_url}/prompt"
        history_url = f"{actual_base_url}/history"

        # 🌟 关键：在此处登记当前网关地址，并重置地雷状态，确立战线
        self._current_base_url = actual_base_url
        self._is_interrupted = False

        try:
            parsed_prompt = json.loads(prompt) if isinstance(prompt, str) else prompt
            actual_workflow = parsed_prompt.get("workflow_json", parsed_prompt) if isinstance(parsed_prompt,
                                                                                              dict) else parsed_prompt
        except Exception:
            return {"success": False, "error": "提交给 ComfyUI 的 prompt 必须是有效的 Workflow JSON"}

        payload = {"prompt": actual_workflow}
        await notify(f"📦 正在连接算力网关: {actual_base_url} ...")

        async with httpx.AsyncClient() as client:
            # 🌟 提交前：扫描工作流中的 base64/URL 图片，上传到 ComfyUI 并替换为文件名
            actual_workflow = await self._upload_inline_images(client, actual_base_url, actual_workflow, notify)
            payload = {"prompt": actual_workflow}

            try:
                # 🌟 提交前第一道防线检查
                if self._is_interrupted:
                    return {"success": False, "error": "任务被手动中断"}

                print(f"🚀 [ComfyUI Engine] 提交任务至: {prompt_url}")
                submit_res = await client.post(prompt_url, json=payload, timeout=15.0)

                if submit_res.status_code != 200:
                    # (原有的错误解析逻辑保持不变...)
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
                    # 🌟 循环防线 1：睡前检查
                    if self._is_interrupted:
                        await notify("🛑 已拦截！正在强行释放 GPU...")
                        return {"success": False, "error": "任务被手动中断 (显存已释放)"}

                    await asyncio.sleep(5)

                    # 🌟 循环防线 2：睡醒检查（防止在 sleep 的这 5 秒内被点击中止）
                    if self._is_interrupted:
                        await notify("🛑 已拦截！正在强行释放 GPU...")
                        return {"success": False, "error": "任务被手动中断 (显存已释放)"}

                    if i % 2 == 0:
                        await notify(f"⚡ GPU 计算中... (已耗时 {i * 5} 秒)")

                    history_res = await client.get(f"{history_url}/{prompt_id}", timeout=10.0)

                    if history_res.status_code == 200:
                        history_data = history_res.json()
                        if prompt_id in history_data:
                            print(f"🎉 [ComfyUI Engine] 渲染完成！")
                            outputs = history_data[prompt_id].get("outputs", {})

                            # (原有的提取 media_url 的代码保持不变...)
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

            # (原有的 except 块保持不变...)
            except httpx.ConnectError as ce:
                error_str = f"网络通信失败 (请检查网关 {actual_base_url} 是否存活)"
                await notify(f"❌ {error_str}")
                return {"success": False, "error": error_str}
            except Exception as e:
                error_str = f"请求异常: {str(e)}"
                await notify(f"❌ {error_str}")
                return {"success": False, "error": error_str}

    async def _upload_inline_images(self, client: httpx.AsyncClient, base_url: str, workflow: dict, notify) -> dict:
        """扫描工作流 JSON，将 base64/URL 图片上传到 ComfyUI 并替换为文件名"""
        upload_url = f"{base_url}/upload/image"

        for node_id, node_data in workflow.items():
            if not isinstance(node_data, dict):
                continue
            inputs = node_data.get("inputs", {})
            for field_name, value in inputs.items():
                if not isinstance(value, str):
                    continue

                image_bytes = None
                ext = "png"

                # base64 data URL
                if value.startswith("data:image/"):
                    try:
                        header, b64data = value.split(",", 1)
                        if "jpeg" in header or "jpg" in header:
                            ext = "jpg"
                        elif "webp" in header:
                            ext = "webp"
                        image_bytes = base64.b64decode(b64data)
                    except Exception:
                        continue

                # 远程 URL 图片
                elif value.startswith("http") and any(value.lower().endswith(e) for e in [".png", ".jpg", ".jpeg", ".webp"]):
                    try:
                        resp = await client.get(value, timeout=30.0)
                        if resp.status_code == 200:
                            image_bytes = resp.content
                            for e in ["jpg", "jpeg", "webp", "png"]:
                                if value.lower().endswith(f".{e}"):
                                    ext = "jpg" if e == "jpeg" else e
                                    break
                    except Exception:
                        continue

                if image_bytes:
                    filename = f"comfyforge_{uuid.uuid4().hex[:8]}.{ext}"
                    try:
                        files = {"image": (filename, image_bytes, f"image/{ext}")}
                        res = await client.post(upload_url, files=files, timeout=30.0)
                        if res.status_code == 200:
                            uploaded_name = res.json().get("name", filename)
                            inputs[field_name] = uploaded_name
                            await notify(f"📤 已上传图片到引擎: {uploaded_name}")
                            print(f"📤 [ComfyUI] 上传图片 {field_name}@node{node_id} → {uploaded_name}")
                        else:
                            print(f"⚠️ [ComfyUI] 图片上传失败: {res.status_code} {res.text[:200]}")
                    except Exception as e:
                        print(f"⚠️ [ComfyUI] 图片上传异常: {e}")

        return workflow