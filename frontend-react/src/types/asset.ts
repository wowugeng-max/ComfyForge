export interface Asset {
  id: number;
  type: 'image' | 'prompt' | 'video'| 'workflow';
  name: string;
  thumbnail?: string;
  data: any;
}