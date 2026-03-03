// src/api/models.ts
import apiClient from './client';

export const syncModels = async (provider: string) => {
  // 调用后端定义的 /api/models/sync/{provider} 接口 [cite: 2026-03-03]
  const response = await apiClient.post(`/models/sync/${provider}`);
  return response.data;
};

export const getModelsByMode = async (mode: string) => {
  // 获取按能力过滤的模型列表 [cite: 2026-03-03]
  const response = await apiClient.get(`/models/?mode=${mode}`);
  return response.data;
};