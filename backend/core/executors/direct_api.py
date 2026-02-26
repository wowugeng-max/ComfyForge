# backend/core/executors/direct_api.py
import re
from typing import Dict, Any, List
from core.adapters.factory import AdapterFactory
from .base import BaseExecutor

class DirectAPIPipelineExecutor(BaseExecutor):
    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        """
        task_def 示例：
        {
            "pipeline": [
                {
                    "step": "llm",
                    "provider": "grok",
                    "input": "生成一个赛博朋克女主的描述",
                    "output_var": "character_desc"
                },
                {
                    "step": "image",
                    "provider": "nano_banana",
                    "prompt": "{character_desc}",
                    "output_var": "character_img"
                },
                {
                    "step": "video",
                    "provider": "wan2.2",
                    "image": "{character_img}",
                    "output_var": "final_video"
                }
            ],
            "api_keys": {
                "grok": "your-key",
                "nano_banana": "your-key",
                "wan2.2": "your-key"
            }
        }
        """
        pipeline = task_def["pipeline"]
        api_keys = task_def.get("api_keys", {})
        context = {}  # 存储中间变量

        for step in pipeline:
            provider = step["provider"]
            # 获取对应适配器
            adapter = AdapterFactory.get_adapter(provider)
            # 解析输入，替换占位符 {var}
            step_inputs = self._resolve_inputs(step, context)
            # 构造 parts 列表（适配器需要的格式）
            parts = self._build_parts(step_inputs)
            # 调用适配器（注意：适配器的 call 方法是同步的，我们需要在线程池中运行或改为异步）
            # 这里为了简单，使用 asyncio.to_thread 在线程池中运行同步代码
            import asyncio
            result = await asyncio.to_thread(
                adapter.call,
                ai_config={
                    "provider": provider,
                    "api_key": api_keys.get(provider),
                    "model_name": step.get("model", "default"),  # 需要指定模型
                    "extra_params": step.get("extra_params", {})
                },
                system_prompt=None,
                parts=parts,
                temperature=step.get("temperature", 0.7),
                seed=step.get("seed", 42)
            )
            # 保存输出到上下文
            if "output_var" in step:
                context[step["output_var"]] = result["content"]
            else:
                # 如果没有指定输出变量，则用步骤名作为键
                context[step["step"]] = result["content"]

        return {"status": "completed", "outputs": context}

    def _resolve_inputs(self, step: Dict, context: Dict) -> Dict:
        """将字符串中的 {var} 替换为 context 中的值"""
        resolved = {}
        for key, value in step.items():
            if isinstance(value, str):
                # 简单替换，可扩展为更强大的模板引擎
                resolved[key] = re.sub(r'\{(\w+)\}', lambda m: str(context.get(m.group(1), m.group(0))), value)
            else:
                resolved[key] = value
        return resolved

    def _build_parts(self, step_inputs: Dict) -> List[Dict]:
        """根据步骤输入构建 parts 列表，供适配器使用"""
        parts = []
        # 如果有 text 字段，作为文本输入
        if "prompt" in step_inputs or "text" in step_inputs:
            text = step_inputs.get("prompt") or step_inputs.get("text")
            parts.append({"type": "text", "data": text})
        # 如果有 image 字段，作为图像输入（可能是 base64 或 URL）
        if "image" in step_inputs:
            parts.append({"type": "image", "data": step_inputs["image"]})
        # 可以扩展更多类型
        return parts