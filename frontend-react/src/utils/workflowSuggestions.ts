import apiClient from '../api/client';

export interface Suggestion {
  field: string;
  friendlyName: string;
  inputType?: string;
  autoCheck?: boolean;
}

// 本地兜底规则（可从 JSON 加载，但为简化保留硬编码）
const localRules: Record<string, Suggestion[]> = {
  CLIPTextEncode: [
    { field: 'text', friendlyName: '提示词', autoCheck: true },
  ],
  CLIPTextEncodeFlux: [
    { field: 'text', friendlyName: '提示词', autoCheck: true },
  ],
  Prompt: [
    { field: 'text', friendlyName: '提示词', autoCheck: true },
  ],
  KSampler: [
    { field: 'seed', friendlyName: '随机种子', autoCheck: true },
    { field: 'steps', friendlyName: '步数', autoCheck: true },
    { field: 'cfg', friendlyName: 'CFG', autoCheck: true },
  ],
  SamplerCustomAdvanced: [
    { field: 'seed', friendlyName: '随机种子', autoCheck: true },
  ],
  LoadImage: [
    { field: 'image', friendlyName: '输入图像', autoCheck: true },
  ],
  LoadVideo: [
    { field: 'video', friendlyName: '输入视频', autoCheck: true },
  ],
  WanFirstLastFrameToVideo: [
    { field: 'frame_a', friendlyName: '首帧', autoCheck: true },
    { field: 'frame_b', friendlyName: '尾帧', autoCheck: true },
  ],
  INTConstant: [
    { field: 'value', friendlyName: '整数值', autoCheck: false },
  ],
};

// 缓存统计数据
let statsCache: Record<string, { field: string; count: number }[]> | null = null;

async function fetchStatsForClass(classType: string): Promise<{ field: string; count: number }[]> {
  try {
    const res = await apiClient.get('/suggestions/recommend', { params: { class_type: classType, limit: 10 } });
    return res.data;
  } catch {
    return [];
  }
}

export async function getSuggestionsForNode(nodeId: string, nodeData: any): Promise<Suggestion[]> {
  const cls = nodeData.class_type;
  let suggestions: Suggestion[] = [];

  // 1. 先尝试从本地规则获取
  if (localRules[cls]) {
    suggestions = localRules[cls];
  } else {
    const lowerCls = cls.toLowerCase();
    if (lowerCls.includes('clip') && lowerCls.includes('encode')) {
      suggestions.push({ field: 'text', friendlyName: '提示词', autoCheck: true });
    }
    if (lowerCls.includes('ksampler') || lowerCls.includes('sampler')) {
      suggestions.push({ field: 'seed', friendlyName: '随机种子', autoCheck: true });
      suggestions.push({ field: 'steps', friendlyName: '步数', autoCheck: true });
    }
    if (lowerCls.includes('load') && (lowerCls.includes('image') || lowerCls.includes('video'))) {
      const inputField = lowerCls.includes('video') ? 'video' : 'image';
      const friendly = lowerCls.includes('video') ? '输入视频' : '输入图像';
      suggestions.push({ field: inputField, friendlyName: friendly, autoCheck: true });
    }
  }

  // 过滤掉节点不存在的字段
  suggestions = suggestions.filter(s => nodeData.inputs && s.field in nodeData.inputs);

  // 2. 获取统计数据，调整 autoCheck（如果统计次数高，则自动勾选）
  const stats = await fetchStatsForClass(cls);
  if (stats.length > 0) {
    // 标记哪些字段在统计中
    const statFields = new Set(stats.map(s => s.field));
    suggestions = suggestions.map(s => ({
      ...s,
      autoCheck: s.autoCheck || statFields.has(s.field), // 如果在统计中，也自动勾选
    }));
  }

  return suggestions;
}

export async function getAllSuggestions(workflowJson: any): Promise<Record<string, Suggestion[]>> {
  const result: Record<string, Suggestion[]> = {};
  for (const [nodeId, nodeData] of Object.entries(workflowJson) as [string, any][]) {
    const sugs = await getSuggestionsForNode(nodeId, nodeData);
    if (sugs.length) {
      result[nodeId] = sugs;
    }
  }
  return result;
}

// 上报函数：从 parameters 中提取统计信息
export function extractStatsFromParameters(parameters: Record<string, { node_id: string; field: string }>, workflowJson: any) {
  const stats: { class_type: string; field: string }[] = [];
  Object.values(parameters).forEach(config => {
    const nodeId = config.node_id;
    const field = config.field.replace(/^inputs\//, '');
    const node = workflowJson[nodeId];
    if (node) {
      stats.push({ class_type: node.class_type, field });
    }
  });
  return stats;
}

export async function reportStats(stats: { class_type: string; field: string }[]) {
  try {
    await apiClient.post('/suggestions/report', { items: stats });
  } catch (e) {
    console.error('上报统计失败', e);
  }
}