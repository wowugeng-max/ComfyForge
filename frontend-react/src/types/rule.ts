export interface RecommendationRule {
  id: number;
  class_type: string;
  field: string;
  friendly_name: string;
  auto_check: boolean;
  enabled: boolean;
  priority: number;
  threshold: number;
  created_at: string;
  updated_at: string;
}

export interface RuleCreate {
  class_type: string;
  field: string;
  friendly_name: string;
  auto_check?: boolean;
  enabled?: boolean;
  priority?: number;
  threshold?: number;
}

export interface RuleUpdate {
  class_type?: string;
  field?: string;
  friendly_name?: string;
  auto_check?: boolean;
  enabled?: boolean;
  priority?: number;
  threshold?: number;
}