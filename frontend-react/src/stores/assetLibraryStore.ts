import { create } from 'zustand';
import apiClient from '../api/client';

export interface Asset {
  id: number;
  type: 'image' | 'prompt' | 'video' | 'workflow' | 'node_config' | 'node_template';
  name: string;
  description?: string;
  thumbnail?: string;
  tags?: string[];
  data: any;
  project_id?: number;
}

interface AssetLibraryState {
  assets: Asset[];
  loading: boolean;
  filterType: string;
  searchText: string;
  scope: 'project' | 'global';
  currentProjectId?: number;
  setScope: (scope: 'project' | 'global') => void;
  fetchAssets: (projectId?: number) => Promise<void>;
  createAsset: (payload: any) => Promise<Asset>;
  updateAsset: (id: number, payload: any) => Promise<void>;
  deleteAsset: (id: number) => Promise<void>;
  setFilterType: (type: string) => void;
  setSearchText: (text: string) => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => ({
  assets: [],
  loading: false,
  filterType: '',
  searchText: '',
  scope: 'project',
  currentProjectId: undefined,

  setScope: (scope) => set({ scope }),

  fetchAssets: async (projectId?: number) => {
    set({ loading: true, currentProjectId: projectId });
    try {
      const { scope } = get();
      let url = '/assets/';
      if (scope === 'global') {
        url = '/assets/?is_global=true';
      } else if (projectId) {
        url = `/assets/?project_id=${projectId}`;
      }
      const res = await apiClient.get(url);
      const assets = res.data.filter((a: any) =>
        ['image', 'prompt', 'video', 'workflow', 'node_config', 'node_template'].includes(a.type)
      );
      set({ assets });
    } catch (error) {
      console.error('加载资产失败', error);
    } finally {
      set({ loading: false });
    }
  },

  createAsset: async (payload: any) => {
    const res = await apiClient.post('/assets/', payload);
    const { currentProjectId } = get();
    await get().fetchAssets(currentProjectId);
    return res.data;
  },

  updateAsset: async (id: number, payload: any) => {
    await apiClient.put(`/assets/${id}`, payload);
    const { currentProjectId } = get();
    await get().fetchAssets(currentProjectId);
  },

  deleteAsset: async (id: number) => {
    await apiClient.delete(`/assets/${id}`);
    const { currentProjectId } = get();
    await get().fetchAssets(currentProjectId);
  },

  setFilterType: (type) => set({ filterType: type }),
  setSearchText: (text) => set({ searchText: text }),
}));
