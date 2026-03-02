import apiClient from './client';
import type {RecommendationRule, RuleCreate, RuleUpdate} from '../types/rule';

export const ruleApi = {
  getAll: (enabled?: boolean) => {
    const params = enabled !== undefined ? { enabled } : {};
    return apiClient.get<RecommendationRule[]>('/recommendation-rules/', { params });
  },
  get: (id: number) => apiClient.get<RecommendationRule>(`/recommendation-rules/${id}`),
  create: (data: RuleCreate) => apiClient.post<RecommendationRule>('/recommendation-rules/', data),
  update: (id: number, data: RuleUpdate) => apiClient.put<RecommendationRule>(`/recommendation-rules/${id}`, data),
  delete: (id: number) => apiClient.delete(`/recommendation-rules/${id}`),
};