# backend/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

# 导入 models 包（会执行 __init__.py，注册所有模型）
from . import models

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/comfyforge.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    os.makedirs("./data", exist_ok=True)
    # 使用 models.Base 创建所有表
    models.Base.metadata.create_all(bind=engine)