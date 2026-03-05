import apiClient from './client';

export interface ProjectCreate {
  name: string;
  description?: string;
  tags?: string[];
}

export const projectApi = {
  // 获取所有项目
  getAll: (skip = 0, limit = 100) => apiClient.get('/projects/', { params: { skip, limit } }),

  // 获取单个项目详情
  getById: (id: number) => apiClient.get(`/projects/${id}`),

  // 创建新项目
  create: (data: ProjectCreate) => apiClient.post('/projects/', data),

  // 更新项目
  update: (id: number, data: Partial<ProjectCreate>) => apiClient.put(`/projects/${id}`, data),

  // 删除项目
  delete: (id: number) => apiClient.delete(`/projects/${id}`),
};