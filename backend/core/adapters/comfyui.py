# backend/core/adapters/comfyui.py

import asyncio
import httpx
import json
from typing import Dict, Any, Optional
from .base import BaseAdapter
from backend.core.registry import ProviderRegistry


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
            is_plus = extra_params.get("instanceType") == "plus"
            proxy_path = "proxy-plus" if is_plus else "proxy"
            actual_base_url = f"https://www.runninghub.cn/{proxy_path}/{api_key}"
        else:
            actual_base_url = (base_url or "http://127.0.0.1:8188").rstrip('/')

        prompt_url = f"{actual_base_url}/prompt"
        history_url = f"{actual_base_url}/history"

        # 2. 🌟 核心防傻与智能“脱壳”逻辑（移至后端）
        try:
            # 先将前端传来的字符串反序列化为 Python 字典
            parsed_prompt = json.loads(prompt) if isinstance(prompt, str) else prompt

            # 智能脱壳：如果发现最外层包了 "workflow_json" 这个壳子，就提取里面的纯净节点字典
            if isinstance(parsed_prompt, dict) and "workflow_json" in parsed_prompt:
                actual_workflow = parsed_prompt["workflow_json"]
            else:
                actual_workflow = parsed_prompt

        except Exception:
            raise ValueError("提交给 ComfyUI 的 prompt 必须是有效的 Workflow JSON")

        # 组装发给原生 ComfyUI 的最终 Payload
        payload = {"prompt": actual_workflow}

        async with httpx.AsyncClient() as client:
            try:
                # ================= 阶段 1：提交原生任务 =================
                print(f"🚀 [ComfyUI Engine] 提交任务至: {prompt_url}")
                submit_res = await client.post(prompt_url, json=payload, timeout=15.0)

                if submit_res.status_code != 200:
                    raise RuntimeError(f"节点提交失败 (HTTP {submit_res.status_code}): {submit_res.text}")

                prompt_id = submit_res.json().get("prompt_id")
                if not prompt_id:
                    raise RuntimeError("未能从引擎获取到 prompt_id")

                print(f"✅ [ComfyUI Engine] 提交成功 | Prompt ID: {prompt_id} | 开始轮询...")

                # ================= 阶段 2：轮询执行结果 =================
                for _ in range(120):
                    await asyncio.sleep(3)

                    history_res = await client.get(f"{history_url}/{prompt_id}", timeout=10.0)
                    if history_res.status_code == 200:
                        history_data = history_res.json()

                        if prompt_id in history_data:
                            print(f"🎉 [ComfyUI Engine] 渲染完成！")
                            outputs = history_data[prompt_id].get("outputs", {})

                            return {
                                "type": type,
                                "content": outputs,
                                "task_id": prompt_id
                            }

                raise RuntimeError("ComfyUI 渲染超时，请检查控制台或增加轮询时间")

            except httpx.RequestError as e:
                raise RuntimeError(f"网络请求异常 (目标: {actual_base_url}): {str(e)}")