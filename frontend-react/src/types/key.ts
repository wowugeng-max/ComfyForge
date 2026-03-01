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
}

export interface APIKeyCreate {
  provider: string;
  key: string;
  description?: string;
  is_active?: boolean;
  priority?: number;
  tags?: string[];
  quota_total?: number;
  quota_unit?: string;
  price_per_call?: number;
}

export interface APIKeyUpdate {
  description?: string;
  is_active?: boolean;
  priority?: number;
  tags?: string[];
}