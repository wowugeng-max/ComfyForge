# backend/core/key_monitor.py
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from ..db import SessionLocal
from ..models.api_key import APIKey
from .key_tester import test_key

async def check_all_keys():
    """后台任务：定期检查所有Key的状态"""
    db = SessionLocal()
    try:
        keys = db.query(APIKey).filter(APIKey.is_active == True).all()
        for key in keys:
            result = test_key(key.provider, key.key)
            if result["valid"]:
                key.last_checked = datetime.utcnow()
                if result.get("quota_remaining") is not None:
                    key.quota_remaining = result["quota_remaining"]
            else:
                # 连续失败3次后自动禁用
                key.failure_count += 1
                if key.failure_count >= 3:
                    key.is_active = False
            db.commit()
    finally:
        db.close()

async def start_key_monitor(interval_seconds=3600):
    """启动定时监控（默认每小时一次）"""
    while True:
        await check_all_keys()
        await asyncio.sleep(interval_seconds)