import re
import asyncio
from typing import Dict, Any, List

from core.adapters.factory import AdapterFactory
from .base import BaseExecutor
from backend.models.asset import Asset
from backend.db import SessionLocal


class DirectAPIPipelineExecutor(BaseExecutor):
    """
    直接 API 管道执行器。
    支持步骤定义中的变量替换 {var} 和资产引用 {asset:id}。
    """

    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行管道任务。
        task_def 结构示例：
        {
            "pipeline": [
                {
                    "step": "llm",
                    "provider": "Qwen",
                    "model": "qwen-max",
                    "prompt": "{asset:1}",           # 支持资产引用
                    "output_var": "story"
                },
                {
                    "step": "image",
                    "provider": "Qwen",
                    "model": "z-image-turbo",
                    "prompt": "{story}",              # 支持上下文变量
                    "output_var": "character_img"
                }
            ],
            "api_keys": {
                "Qwen": "your-key"
            }
        }
        """
        db = SessionLocal()  # 创建数据库会话，用于资产查询
        try:
            pipeline = task_def["pipeline"]
            api_keys = task_def.get("api_keys", {})
            context = {}  # 存储中间变量

            for step in pipeline:
                provider = step["provider"]
                adapter = AdapterFactory.get_adapter(provider)

                # 解析输入：替换变量和资产引用
                step_inputs = self._resolve_inputs(step, context, db)

                # 构建适配器所需的 parts 列表
                parts = self._build_parts(step_inputs)

                # 调用适配器（同步方法放入线程池）
                result = await asyncio.to_thread(
                    adapter.call,
                    ai_config={
                        "provider": provider,
                        "api_key": api_keys.get(provider),
                        "model_name": step.get("model", "default"),
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
                    context[step["step"]] = result["content"]

            return {"status": "completed", "outputs": context}

        finally:
            db.close()  # 确保会话关闭

    def _resolve_inputs(self, step: Dict, context: Dict, db) -> Dict:
        """
        递归解析步骤输入：
        - 将 {var} 替换为 context 中的值
        - 将 {asset:id} 替换为资产内容
        """
        resolved = {}
        for key, value in step.items():
            if isinstance(value, str):
                # 1. 替换上下文变量 {var}
                value = re.sub(
                    r'\{(\w+)\}',
                    lambda m: str(context.get(m.group(1), m.group(0))),
                    value
                )
                # 2. 替换资产引用 {asset:id}
                value = self._replace_asset_refs(value, db)
                resolved[key] = value
            else:
                resolved[key] = value
        return resolved

    def _replace_asset_refs(self, text: str, db) -> str:
        """
        将文本中的 {asset:id} 替换为对应资产的内容。
        目前仅支持 prompt 类型的资产，从 data.content 字段取值。
        """
        pattern = r'\{asset:(\d+)\}'

        def replacer(match):
            asset_id = int(match.group(1))
            # 查询 prompt 类型的资产
            asset = db.query(Asset).filter(
                Asset.id == asset_id,
                Asset.type == 'prompt'
            ).first()
            if asset:
                # 从 data 字段提取 content，若不存在则返回空字符串
                return asset.data.get('content', '')
            else:
                # 资产不存在或类型不匹配，保留占位符并警告
                print(f"Warning: Asset {asset_id} not found or not a prompt type.")
                return match.group(0)  # 保留原样

        return re.sub(pattern, replacer, text)

    def _build_parts(self, step_inputs: Dict) -> List[Dict]:
        """
        根据步骤输入构建适配器所需的 parts 列表。
        parts 列表格式： [{"type": "text"/"image", "data": ...}]
        """
        parts = []
        # 文本输入（优先使用 prompt 字段，兼容旧版 text）
        if "prompt" in step_inputs or "text" in step_inputs:
            text = step_inputs.get("prompt") or step_inputs.get("text")
            parts.append({"type": "text", "data": text})
        # 图像输入
        if "image" in step_inputs:
            parts.append({"type": "image", "data": step_inputs["image"]})
        # 可继续扩展其他类型（如 audio, video 等）
        return parts