export interface Asset {
  id: number;
  type: 'image' | 'prompt' | 'video';
  name: string;
  thumbnail?: string;
  data: any;
}