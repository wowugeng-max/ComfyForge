# backend/core/router.py
from typing import Optional, List
from sqlalchemy.orm import Session
from ..models.api_key import APIKey
import random
from datetime import datetime

class RoutingStrategy:
    COST_FIRST = "cost"          # 价格优先
    SPEED_FIRST = "speed"        # 速度优先
    BALANCED = "balanced"        # 平衡（按优先级）
    RANDOM = "random"            # 随机（可用于负载均衡）

class KeyRouter:
    """根据策略从数据库中选择最佳 Key"""

    def __init__(self, db: Session):
        self.db = db

    def select_key(
        self,
        provider: str,
        required_tags: Optional[List[str]] = None,
        strategy: str = RoutingStrategy.BALANCED,
        min_quota: int = 1
    ) -> Optional[APIKey]:
        """
        查询可用 Key，并按策略排序返回最优 Key。
        :param provider: 提供商名称
        :param required_tags: 必须包含的标签列表
        :param strategy: 选择策略
        :param min_quota: 最低剩余配额要求
        :return: APIKey 对象或 None
        """
        query = self.db.query(APIKey).filter(
            APIKey.provider == provider,
            APIKey.is_active == True,
            APIKey.quota_remaining >= min_quota
        )
        if required_tags:
            # SQLite 中 JSON 字段包含所有标签的简单判断
            for tag in required_tags:
                query = query.filter(APIKey.tags.contains([tag]))

        keys = query.all()
        if not keys:
            return None

        # 按策略排序
        if strategy == RoutingStrategy.COST_FIRST:
            # 价格升序，同价格按优先级升序
            keys.sort(key=lambda k: (k.price_per_call, k.priority))
        elif strategy == RoutingStrategy.SPEED_FIRST:
            # 平均延迟升序，同时考虑优先级
            keys.sort(key=lambda k: (k.avg_latency, k.priority))
        elif strategy == RoutingStrategy.RANDOM:
            return random.choice(keys)
        else:  # BALANCED
            # 简单按优先级升序，可扩展为加权评分
            keys.sort(key=lambda k: k.priority)

        return keys[0]

    def record_call_metrics(self, key_id: int, latency_ms: float, success: bool, quota_used: int = 0):
        """记录调用后更新 Key 的统计信息"""
        key = self.db.query(APIKey).filter(APIKey.id == key_id).first()
        if not key:
            return
        if success:
            key.success_count += 1
            # 更新平均延迟（指数移动平均，平滑处理）
            if key.avg_latency == 0:
                key.avg_latency = latency_ms
            else:
                key.avg_latency = 0.9 * key.avg_latency + 0.1 * latency_ms
            key.quota_remaining -= quota_used
        else:
            key.failure_count += 1
        key.last_used = datetime.utcnow()
        self.db.commit()