import { create } from 'zustand';
import apiClient from '../api/client';

export interface Asset {
  id: number;
  type: 'image' | 'prompt' | 'video'| 'workflow';
  name: string;
  thumbnail?: string;
  data: any;
  project_id?: number; // 🌟 必须加上
}

interface AssetLibraryState {
  assets: Asset[];
  loading: boolean;
  filterType: string;
  searchText: string;
  fetchAssets: (projectId?: number) => Promise<void>; // 🌟 接收 projectId
  setFilterType: (type: string) => void;
  setSearchText: (text: string) => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => ({
  assets: [],
  loading: false,
  filterType: '',
  searchText: '',
  fetchAssets: async (projectId?: number) => {
    set({ loading: true });
    try {
      // 🌟 根据 projectId 动态请求
      const url = projectId ? `/assets/?project_id=${projectId}` : '/assets/';
      const res = await apiClient.get(url);
      const assets = res.data.filter((a: any) => ['image', 'prompt', 'video','workflow'].includes(a.type));
      set({ assets });
    } catch (error) {
      console.error('加载资产失败', error);
    } finally {
      set({ loading: false });
    }
  },
  setFilterType: (type) => set({ filterType: type }),
  setSearchText: (text) => set({ searchText: text }),
}));