// src/api/models.ts
import apiClient from './client';

export const modelApi = {
  // 获取某个 Key 下的模型
  getByKeyId: (keyId: number, mode?: string) => {
    return apiClient.get('/models/', { params: { key_id: keyId, mode } });
  },

  // 新增：手动创建模型
  create: (data: any) => apiClient.post('/models/', data),

  // 新增：更新模型（比如开关状态、修改能力）
  update: (id: number, data: any) => apiClient.put(`/models/${id}`, data),

  // 新增：删除手动模型
  delete: (id: number) => apiClient.delete(`/models/${id}`),

  // 🌟 新增：单点连通性测试
  test: (id: number) => apiClient.post(`/models/${id}/test`),

  // 🌟 新增：大类批量更新接口
  bulkUpdateUiParams: (payload: { api_key_id: number; capability: string; ui_params_array: any[] }) =>
    apiClient.put('/models/bulk/ui-params', payload),
};