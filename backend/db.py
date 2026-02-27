# backend/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models.asset import Base
import os

# 使用 SQLite 文件数据库
SQLALCHEMY_DATABASE_URL = "sqlite:///./data/comfyforge.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    os.makedirs("./data", exist_ok=True)
    Base.metadata.create_all(bind=engine)