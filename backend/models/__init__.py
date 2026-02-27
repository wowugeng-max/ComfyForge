# backend/models/__init__.py
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# 导入所有模型，确保它们注册到 Base
from .asset import Asset
from .project import Project