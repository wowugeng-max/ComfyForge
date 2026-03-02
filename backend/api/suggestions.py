from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime

from ..db import SessionLocal
from ..models.node_parameter_stat import NodeParameterStat

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])

# 依赖
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class ReportItem(BaseModel):
    class_type: str
    field: str

class ReportRequest(BaseModel):
    items: List[ReportItem]   # 一次上报多个配置

class SuggestionOut(BaseModel):
    field: str
    count: int

    class Config:
        from_attributes = True

@router.post("/report")
def report_stats(request: ReportRequest, db: Session = Depends(get_db)):
    """接收前端上报的参数配置统计"""
    for item in request.items:
        # 查找或创建记录
        stat = db.query(NodeParameterStat).filter(
            NodeParameterStat.class_type == item.class_type,
            NodeParameterStat.field == item.field
        ).first()
        if stat:
            stat.count += 1
        else:
            stat = NodeParameterStat(
                class_type=item.class_type,
                field=item.field,
                count=1
            )
            db.add(stat)
    db.commit()
    return {"status": "ok"}

@router.get("/recommend", response_model=List[SuggestionOut])
def recommend_stats(class_type: str, limit: int = 5, db: Session = Depends(get_db)):
    """获取某节点类型的推荐字段（按使用次数降序）"""
    stats = db.query(NodeParameterStat).filter(
        NodeParameterStat.class_type == class_type
    ).order_by(NodeParameterStat.count.desc()).limit(limit).all()
    return stats