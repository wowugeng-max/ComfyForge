from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db import get_db  # 统一导入
from ..models.recommendation_rule import RecommendationRule
from sqlalchemy import func
from ..models.node_parameter_stat import NodeParameterStat

router = APIRouter(prefix="/api/recommendation-rules", tags=["recommendation-rules"])

class RuleBase(BaseModel):
    class_type: str
    field: str
    friendly_name: str
    auto_check: bool = False
    enabled: bool = True
    priority: int = 0
    threshold: int = 1

class RuleCreate(RuleBase):
    pass

class RuleUpdate(BaseModel):
    class_type: Optional[str] = None
    field: Optional[str] = None
    friendly_name: Optional[str] = None
    auto_check: Optional[bool] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    threshold: Optional[int] = None

class RuleOut(RuleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class CombinedRuleOut(BaseModel):
    id: Optional[int]  # 手动规则有id，学习规则为None
    class_type: str
    field: str
    friendly_name: str
    auto_check: bool
    enabled: bool
    priority: int
    threshold: int
    source: str  # 'manual' 或 'learned'
    count: Optional[int] = None  # 学习规则的统计次数
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

@router.get("/", response_model=List[RuleOut])
def list_rules(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    enabled: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(RecommendationRule)
    if enabled is not None:
        query = query.filter(RecommendationRule.enabled == enabled)
    return query.offset(skip).limit(limit).all()

@router.post("/", response_model=RuleOut)
def create_rule(rule: RuleCreate, db: Session = Depends(get_db)):
    db_rule = RecommendationRule(**rule.dict())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.get("/{rule_id:int}", response_model=RuleOut)
def get_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(RecommendationRule).filter(RecommendationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    return rule

@router.put("/{rule_id:int}", response_model=RuleOut)
def update_rule(rule_id: int, rule_update: RuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(RecommendationRule).filter(RecommendationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    for field, value in rule_update.dict(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule

@router.delete("/{rule_id:int}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(RecommendationRule).filter(RecommendationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return

@router.get("/combined", response_model=List[CombinedRuleOut])
def get_combined_rules(db: Session = Depends(get_db)):
    # 1. 获取手动规则
    manual_rules = db.query(RecommendationRule).all()
    manual_out = [
        CombinedRuleOut(
            id=r.id,
            class_type=r.class_type,
            field=r.field,
            friendly_name=r.friendly_name,
            auto_check=r.auto_check,
            enabled=r.enabled,
            priority=r.priority,
            threshold=r.threshold,
            source='manual',
            count=None,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in manual_rules
    ]

    # 2. 获取学习规则（从统计表中按 class_type, field 分组，取最大计数）
    # 排除已在手动规则中出现的 (class_type, field)
    manual_keys = {(r.class_type, r.field) for r in manual_rules}
    stats_query = db.query(
        NodeParameterStat.class_type,
        NodeParameterStat.field,
        func.sum(NodeParameterStat.count).label('total_count')
    ).group_by(NodeParameterStat.class_type, NodeParameterStat.field)
    stats = stats_query.all()
    learned_out = []
    for s in stats:
        if (s.class_type, s.field) not in manual_keys:
            learned_out.append(CombinedRuleOut(
                id=None,
                class_type=s.class_type,
                field=s.field,
                friendly_name=s.field,  # 临时用字段名，可考虑用更友好的映射
                auto_check=False,
                enabled=True,  # 学习规则默认启用
                priority=999,  # 默认优先级低
                threshold=1,
                source='learned',
                count=s.total_count,
                created_at=None,
                updated_at=None,
            ))

    return manual_out + learned_out