# backend/core/key_monitor.py
import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..db import SessionLocal
from ..models.api_key import APIKey
from .key_tester import test_key

logger = logging.getLogger(__name__)

async def check_keys_once():
    """执行一次Key检查"""
    db = SessionLocal()
    try:
        # 检查所有活跃Key（包括即将过期的）
        keys = db.query(APIKey).filter(APIKey.is_active == True).all()
        for key in keys:
            # 如果上次检查时间在最近1小时内，跳过（可选）
            if key.last_checked and (datetime.utcnow() - key.last_checked) < timedelta(hours=1):
                continue
            result = test_key(key.provider, key.key)
            if result["valid"]:
                key.is_active = True
                key.failure_count = 0
                if result.get("quota_remaining") is not None:
                    key.quota_remaining = result["quota_remaining"]
            else:
                key.failure_count += 1
                if key.failure_count >= 3:
                    key.is_active = False
            key.last_checked = datetime.utcnow()
            db.commit()
    except Exception as e:
        logger.error(f"Key monitoring error: {e}")
    finally:
        db.close()

async def start_key_monitor(interval_minutes=60):
    """启动定时监控循环"""
    while True:
        await check_keys_once()
        await asyncio.sleep(interval_minutes * 60)

def run_key_monitor_in_thread(interval_minutes=60):
    """用于在后台线程中运行的包装函数"""
    asyncio.run(start_key_monitor(interval_minutes))


async def check_all_keys():
    db = SessionLocal()
    try:
        keys = db.query(APIKey).filter(APIKey.is_active == True).all()
        for key in keys:
            result = test_key(key.provider, key.key)
            if result["valid"]:
                key.last_checked = datetime.utcnow()
                if result.get("quota_remaining") is not None:
                    key.quota_remaining = result["quota_remaining"]
                key.failure_count = 0
            else:
                key.failure_count += 1
                if key.failure_count >= 3:
                    key.is_active = False
            db.commit()
    finally:
        db.close()
