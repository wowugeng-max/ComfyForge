// frontend-react/src/api/providers.ts
import apiClient from './client';

export interface ProviderData {
  id: string;
  display_name: string;
  service_type: string;
  api_format: string;
  auth_type: string;
  supported_modalities: string[];
  default_base_url?: string;
  is_active: boolean;
  icon?: string;
  // 🌟 架构升级：新增的高级配置字段
  endpoints?: Record<string, string>;
  custom_headers?: Record<string, string>;
}

export const providerApi = {
  // 获取列表
  getAll: (service_type?: string) => apiClient.get<ProviderData[]>('/providers/', { params: { service_type } }),
  // 新增：创建、更新、删除
  create: (data: Partial<ProviderData>) => apiClient.post<ProviderData>('/providers/', data),
  update: (id: string, data: Partial<ProviderData>) => apiClient.put<ProviderData>(`/providers/${id}`, data),
  delete: (id: string) => apiClient.delete(`/providers/${id}`)
};