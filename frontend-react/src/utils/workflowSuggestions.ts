import apiClient from '../api/client';

export interface Suggestion {
  field: string;
  friendlyName: string;
  inputType?: string;
  autoCheck?: boolean;
}

// 本地兜底规则（硬编码，用于冷启动或未学习到的节点）
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
  // 可根据需要添加更多本地规则
};

// 缓存统计数据（可选，避免重复请求）
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

  // 1. 从本地规则获取基础建议
  if (localRules[cls]) {
    suggestions = localRules[cls];
  } else {
    // 模糊匹配兜底（备用）
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

  // 2. 获取统计数据
  const stats = await fetchStatsForClass(cls);
  const statFields = new Map(stats.map(s => [s.field, s.count]));

  // 3. 将统计中出现的字段也加入建议（如果节点存在该字段且尚未在建议中）
  if (stats.length > 0) {
    for (const stat of stats) {
      const field = stat.field;
      if (nodeData.inputs && field in nodeData.inputs) {
        const existing = suggestions.find(s => s.field === field);
        if (!existing) {
          // 新字段：使用字段名作为友好名称（可优化），autoCheck 可根据统计次数决定，这里简单设为 true
          suggestions.push({
            field,
            friendlyName: field, // 可以改为从统计中获取常见名称（暂不实现）
            autoCheck: true,      // 有统计记录就自动勾选
          });
        }
      }
    }
  }

  // 4. 过滤掉节点不存在的字段（安全起见）
  suggestions = suggestions.filter(s => nodeData.inputs && s.field in nodeData.inputs);

  // 5. 用统计信息调整 autoCheck（对于已存在的建议，如果有统计，确保 autoCheck 为 true）
  if (stats.length > 0) {
    suggestions = suggestions.map(s => ({
      ...s,
      autoCheck: s.autoCheck || statFields.has(s.field),
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

// 从 parameters 中提取统计信息
export function extractStatsFromParameters(
  parameters: Record<string, { node_id: string; field: string }>,
  workflowJson: any
) {
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

// 上报统计到后端
export async function reportStats(stats: { class_type: string; field: string }[]) {
  try {
    await apiClient.post('/suggestions/report', { items: stats });
  } catch (e) {
    console.error('上报统计失败', e);
  }
}