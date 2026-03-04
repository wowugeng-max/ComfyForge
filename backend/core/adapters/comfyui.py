# backend/core/adapters/comfyui.py
import asyncio
import httpx
import json
from typing import Dict, Any, Optional
from .base import BaseAdapter
from backend.core.registry import ProviderRegistry


# 🌟 神奇的统一：同时注册给本地和云端！
@ProviderRegistry.register_adapter("local_comfyui")
@ProviderRegistry.register_adapter("runninghub")
class ComfyUIAdapter(BaseAdapter):
    async def generate(
            self,
            api_key: str,
            model_name: str,
            prompt: str,
            type: str,
            extra_params: Dict[str, Any],
            base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        大一统的 ComfyUI 算力引擎（支持局域网原生与 RunningHub 云端代理）
        """
        # 1. 动态构建真正的 API 地址
        if "runninghub" in str(base_url).lower():
            # 兼容 RunningHub 的原生代理接口规范
            is_plus = extra_params.get("instanceType") == "plus"
            proxy_path = "proxy-plus" if is_plus else "proxy"
            actual_base_url = f"https://www.runninghub.cn/{proxy_path}/{api_key}"
        else:
            # 兼容本地 127.0.0.1 或 自定义中转站
            actual_base_url = (base_url or "http://127.0.0.1:8188").rstrip('/')

        prompt_url = f"{actual_base_url}/prompt"
        history_url = f"{actual_base_url}/history"

        # 2. 准备原生 ComfyUI 的 payload
        try:
            workflow_json = json.loads(prompt) if isinstance(prompt, str) else prompt
        except Exception:
            raise ValueError("提交给 ComfyUI 的 prompt 必须是有效的 Workflow JSON")

        payload = {"prompt": workflow_json}

        async with httpx.AsyncClient() as client:
            try:
                # ================= 阶段 1：提交原生任务 =================
                print(f"🚀 [ComfyUI Engine] 提交任务至: {prompt_url}")
                submit_res = await client.post(prompt_url, json=payload, timeout=15.0)

                if submit_res.status_code != 200:
                    raise RuntimeError(f"节点提交失败: {submit_res.text}")

                prompt_id = submit_res.json().get("prompt_id")
                if not prompt_id:
                    raise RuntimeError("未能从引擎获取到 prompt_id")

                print(f"✅ [ComfyUI Engine] 提交成功 | Prompt ID: {prompt_id} | 开始轮询...")

                # ================= 阶段 2：轮询执行结果 =================
                # 根据生成复杂度和显存，最多轮询 120 次（比如每次 3 秒，共 6 分钟）
                for _ in range(120):
                    await asyncio.sleep(3)

                    history_res = await client.get(f"{history_url}/{prompt_id}", timeout=10.0)
                    if history_res.status_code == 200:
                        history_data = history_res.json()

                        # 如果返回的历史记录中包含了我们的 prompt_id，说明已完成
                        if prompt_id in history_data:
                            print(f"🎉 [ComfyUI Engine] 渲染完成！")
                            # 获取最终的输出节点数据
                            outputs = history_data[prompt_id].get("outputs", {})

                            return {
                                "type": type,
                                "content": outputs,  # 这里返回的是 ComfyUI 的输出字典格式，方便外部二次解析
                                "task_id": prompt_id
                            }

                raise RuntimeError("ComfyUI 渲染超时，请检查控制台或增加轮询时间")

            except httpx.RequestError as e:
                raise RuntimeError(f"网络请求异常 (目标: {actual_base_url}): {str(e)}")