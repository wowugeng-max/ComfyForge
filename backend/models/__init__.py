# backend/models/__init__.py
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# 导入所有模型，确保它们注册到 Base
from .asset import Asset
from .project import Project
from .api_key import APIKey  # 新增
from .node_parameter_stat import NodeParameterStat