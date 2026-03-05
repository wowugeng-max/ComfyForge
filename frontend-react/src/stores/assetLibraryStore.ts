import { create } from 'zustand';
import apiClient from '../api/client';

export interface Asset {
  id: number;
  type: 'image' | 'prompt' | 'video'| 'workflow';
  name: string;
  thumbnail?: string;
  data: any;
  project_id?: number;
}

interface AssetLibraryState {
  assets: Asset[];
  loading: boolean;
  filterType: string;
  searchText: string;
  scope: 'project' | 'global'; // 🌟 1. 新增作用域状态
  setScope: (scope: 'project' | 'global') => void;
  fetchAssets: (projectId?: number) => Promise<void>;
  setFilterType: (type: string) => void;
  setSearchText: (text: string) => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => ({
  assets: [],
  loading: false,
  filterType: '',
  searchText: '',
  scope: 'project', // 默认看项目的
  setScope: (scope) => set({ scope }), // 切换作用域方法
  fetchAssets: async (projectId?: number) => {
    set({ loading: true });
    try {
      const { scope } = get();
      // 🌟 2. 根据作用域动态构建 URL
      let url = '/assets/';
      if (scope === 'global') {
        url = '/assets/?is_global=true';
      } else if (projectId) {
        url = `/assets/?project_id=${projectId}`;
      }

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