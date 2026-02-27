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
        db = SessionLocal()  # 创建数据库会话，用于资产查询
        visited_asset_ids = set()  # 记录本次执行引用的资产 ID
        try:
            pipeline = task_def["pipeline"]
            api_keys = task_def.get("api_keys", {})
            context = {}  # 存储中间变量

            for step in pipeline:
                provider = step["provider"]
                adapter = AdapterFactory.get_adapter(provider)

                step_inputs = self._resolve_inputs(step, context, db, visited_asset_ids)
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

            # 所有步骤执行完毕，返回结果
            return {"status": "completed", "outputs": context, "visited_asset_ids": list(visited_asset_ids)}

        finally:
            db.close()  # 确保会话关闭

    def _resolve_inputs(self, step: Dict, context: Dict, db, visited_asset_ids: set) -> Dict:
        """
        递归解析步骤输入：
        - 将 {var} 替换为 context 中的值
        - 将 {asset:id} 替换为资产内容，并记录访问的资产 ID
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
                # 2. 替换资产引用 {asset:id}，并传递 visited_asset_ids
                value = self._replace_asset_refs(value, db, visited_asset_ids)
                resolved[key] = value
            else:
                resolved[key] = value
        return resolved

    def _replace_asset_refs(self, text: str, db, visited_ids: set) -> str:
        pattern = r'\{asset:(\d+)(?:\.([\w\.]+))?\}'

        def replacer(match):
            asset_id = int(match.group(1))
            visited_ids.add(asset_id)  # 记录
            field_path = match.group(2)  # 可能为 None，例如 "data.content" 或 "data.variants.angry"

            asset = db.query(Asset).filter(Asset.id == asset_id).first()
            if not asset:
                print(f"Warning: Asset {asset_id} not found.")
                return match.group(0)

            # 获取 asset.data
            data = asset.data

            if field_path:
                # 按点号分割路径，逐层访问
                parts = field_path.split('.')
                for part in parts:
                    if isinstance(data, dict):
                        data = data.get(part, None)
                    else:
                        data = None
                        break
                if data is None:
                    print(f"Warning: Field {field_path} not found in asset {asset_id}.")
                    return match.group(0)
                return str(data)
            else:
                # 无字段路径，根据资产类型返回默认值
                if asset.type == 'prompt':
                    return asset.data.get('content', '')
                elif asset.type == 'character':
                    return asset.data.get('core_prompt', '')
                elif asset.type == 'workflow':
                    # 工作流资产可能不适合直接作为字符串，可以返回 ID 或其他
                    return f"workflow_{asset_id}"
                else:
                    return match.group(0)

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