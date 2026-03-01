import apiClient from './client';
import type {APIKey, APIKeyCreate, APIKeyUpdate} from '../types/key';

export const keyApi = {
  // 获取所有 Key
  getAll: (params?: { provider?: string; is_active?: boolean }) =>
    apiClient.get<APIKey[]>('/keys/', { params }),

  // 获取单个 Key
  get: (id: number) => apiClient.get<APIKey>(`/keys/${id}`),

  // 创建 Key
  create: (data: APIKeyCreate) => apiClient.post<APIKey>('/keys/', data),

  // 更新 Key
  update: (id: number, data: APIKeyUpdate) =>
    apiClient.put<APIKey>(`/keys/${id}`, data),

  // 删除 Key
  delete: (id: number) => apiClient.delete(`/keys/${id}`),

  // 测试 Key
  test: (id: number) => apiClient.post<{ valid: boolean; quota_remaining?: number; message?: string }>(`/keys/${id}/test`),

  // 测试所有 Key
  testAll: () => apiClient.post('/keys/test-all'),
};