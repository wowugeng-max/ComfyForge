import { create } from 'zustand';
import apiClient from '../api/client';

export interface Asset {
  id: number;
  type: 'image' | 'prompt' | 'video'| 'workflow';
  name: string;
  thumbnail?: string;
  data: any;
}

interface AssetLibraryState {
  assets: Asset[];
  loading: boolean;
  filterType: string;
  searchText: string;
  fetchAssets: () => Promise<void>;
  setFilterType: (type: string) => void;
  setSearchText: (text: string) => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => ({
  assets: [],
  loading: false,
  filterType: '',
  searchText: '',
  fetchAssets: async () => {
    set({ loading: true });
    try {
      const res = await apiClient.get('/assets/');
      // 过滤出需要的类型
      const assets = res.data.filter((a: any) => ['image', 'prompt', 'video'].includes(a.type));
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