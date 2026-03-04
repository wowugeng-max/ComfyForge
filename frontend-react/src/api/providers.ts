// src/api/providers.ts
import apiClient from './client';

export const providerApi = {
  // 获取提供商列表，支持按 service_type 过滤
  getAll: (service_type?: string) => {
    return apiClient.get('/providers/', { params: { service_type } });
  }
};