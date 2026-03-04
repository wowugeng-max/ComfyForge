export interface APIKey {
  id: number;
  provider: string;
  key: string;
  description: string;
  is_active: boolean;
  priority: number;
  tags: string[];
  quota_total: number;
  quota_remaining: number;
  quota_unit: string;
  price_per_call: number;
  success_count: number;
  failure_count: number;
  avg_latency: number;
  last_used: string | null;
  last_checked: string;
  created_at: string;
  expires_at: string | null;

  // 🌟 核心新增：服务类型与自定义网关
  service_type: string;
  base_url: string | null;
}

export interface APIKeyCreate {
  provider: string;
  key?: string; // 🌟 改为可选，因为本地算力可以没有 key
  description?: string;
  is_active?: boolean;
  priority?: number;
  tags?: string[];
  quota_total?: number;
  quota_unit?: string;
  price_per_call?: number;

  // 🌟 核心新增：创建时允许传入这两个字段
  service_type?: string;
  base_url?: string;
}

export interface APIKeyUpdate {
  provider?: string;
  key?: string;
  description?: string;
  is_active?: boolean;
  priority?: number;
  tags?: string[];

  // 🌟 核心新增：更新时也允许修改这两个字段
  service_type?: string;
  base_url?: string;
}