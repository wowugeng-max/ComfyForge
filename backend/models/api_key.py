# backend/models/api_key.py
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON, Text
from datetime import datetime
from . import Base


class APIKey(Base):
    __tablename__ = 'api_keys'

    id = Column(Integer, primary_key=True)
    provider = Column(String(50), nullable=False)  # Qwen, Gemini, Grok, Hailuo, etc.
    key = Column(Text, nullable=False)  # 实际的API Key
    description = Column(String(200), default="")  # 备注
    is_active = Column(Boolean, default=True)  # 是否启用

    # 额度信息
    quota_total = Column(Integer, default=0)  # 总配额（根据平台类型）
    quota_remaining = Column(Integer, default=0)  # 剩余配额
    quota_unit = Column(String(20), default="count")  # 单位: count, token, seconds

    # 计费信息
    price_per_call = Column(Float, default=0.0)  # 每次调用价格（超出免费后）
    billing_type = Column(String(20), default="payg")  # payg: 按量付费, quota: 套餐

    # 性能指标
    priority = Column(Integer, default=0)  # 优先级（0最高）
    success_count = Column(Integer, default=0)  # 成功调用次数
    failure_count = Column(Integer, default=0)  # 失败调用次数
    avg_latency = Column(Float, default=0.0)  # 平均延迟（ms）

    # 时间信息
    last_used = Column(DateTime, nullable=True)
    last_checked = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # 过期时间

    # 标签和元数据
    tags = Column(JSON, default=list)  # 例如 ["free", "backup", "primary"]
    extra_metadata = Column(JSON, default=dict)  # 额外信息（改名，避免与SQLAlchemy保留字冲突）