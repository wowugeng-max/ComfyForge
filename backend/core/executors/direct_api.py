# backend/core/executors/direct_api.py
import re
import asyncio
import time  # 新增导入
from typing import Dict, Any, List

from core.adapters.factory import AdapterFactory
from .base import BaseExecutor
from backend.models.asset import Asset
from backend.db import SessionLocal
from backend.core.router import KeyRouter, RoutingStrategy  # 新增导入


class DirectAPIPipelineExecutor(BaseExecutor):
    """
    直接 API 管道执行器。
    支持步骤定义中的变量替换 {var} 和资产引用 {asset:id}。
    """

    async def execute(self, task_def: Dict[str, Any]) -> Dict[str, Any]:
        db = SessionLocal()  # 创建数据库会话，用于资产查询和 Key 路由
        visited_asset_ids = set()  # 记录本次执行引用的资产 ID
        try:
            pipeline = task_def["pipeline"]
            api_keys = task_def.get("api_keys", {})
            context = {}  # 存储中间变量

            for step in pipeline:
                provider = step["provider"]
                # 获取适配器，传入数据库会话和路由策略（这里使用默认策略）
                adapter = AdapterFactory.get_adapter(provider, db_session=db, strategy=RoutingStrategy.BALANCED)

                step_inputs = self._resolve_inputs(step, context, db, visited_asset_ids)
                parts = self._build_parts(step_inputs)

                # 记录开始时间
                start_time = time.time()
                try:
                    # 调用适配器（同步方法放入线程池）
                    result = await asyncio.to_thread(
                        adapter.call,
                        ai_config={
                            "provider": provider,
                            "api_key": api_keys.get(provider),  # 如果数据库注入了 Key，此值被忽略
                            "model_name": step.get("model", "default"),
                            "extra_params": step.get("extra_params", {})
                        },
                        system_prompt=None,
                        parts=parts,
                        temperature=step.get("temperature", 0.7),
                        seed=step.get("seed", 42)
                    )
                    latency = (time.time() - start_time) * 1000  # ms
                    success = True
                except Exception as e:
                    latency = (time.time() - start_time) * 1000
                    success = False
                    # 记录失败指标
                    if hasattr(adapter, 'key_id') and adapter.key_id:
                        router = KeyRouter(db)
                        router.record_call_metrics(adapter.key_id, latency, success=False)
                    raise e  # 重新抛出异常，任务失败

                # 记录成功指标
                if hasattr(adapter, 'key_id') and adapter.key_id:
                    router = KeyRouter(db)
                    # 假设每次调用消耗 1 单位配额，可根据实际情况调整
                    router.record_call_metrics(adapter.key_id, latency, success=True, quota_used=1)

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
        """（原有代码保持不变）"""
        resolved = {}
        for key, value in step.items():
            if isinstance(value, str):
                value = re.sub(
                    r'\{(\w+)\}',
                    lambda m: str(context.get(m.group(1), m.group(0))),
                    value
                )
                value = self._replace_asset_refs(value, db, visited_asset_ids)
                resolved[key] = value
            else:
                resolved[key] = value
        return resolved

    def _replace_asset_refs(self, text: str, db, visited_ids: set) -> str:
        """（原有代码保持不变）"""
        pattern = r'\{asset:(\d+)(?:\.([\w\.]+))?\}'
        def replacer(match):
            asset_id = int(match.group(1))
            visited_ids.add(asset_id)
            field_path = match.group(2)
            asset = db.query(Asset).filter(Asset.id == asset_id).first()
            if not asset:
                print(f"Warning: Asset {asset_id} not found.")
                return match.group(0)
            data = asset.data
            if field_path:
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
                if asset.type == 'prompt':
                    return asset.data.get('content', '')
                elif asset.type == 'character':
                    return asset.data.get('core_prompt', '')
                elif asset.type == 'workflow':
                    return f"workflow_{asset_id}"
                else:
                    return match.group(0)
        return re.sub(pattern, replacer, text)

    def _build_parts(self, step_inputs: Dict) -> List[Dict]:
        """（原有代码保持不变）"""
        parts = []
        if "prompt" in step_inputs or "text" in step_inputs:
            text = step_inputs.get("prompt") or step_inputs.get("text")
            parts.append({"type": "text", "data": text})
        if "image" in step_inputs:
            parts.append({"type": "image", "data": step_inputs["image"]})
        return parts