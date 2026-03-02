import apiClient from '../api/client';
import type {RecommendationRule} from '../types/rule';

export interface Suggestion {
  field: string;
  friendlyName: string;
  inputType?: string;
  autoCheck?: boolean;
}

let rulesCache: Record<string, Array<{ field: string; friendlyName: string; autoCheck: boolean; priority: number; threshold: number }>> | null = null;

async function fetchRules() {
  if (rulesCache) return rulesCache;
  try {
    const res = await apiClient.get<RecommendationRule[]>('/recommendation-rules/?enabled=true');
    const rules = res.data;
    const map: Record<string, any[]> = {};
    rules.forEach(rule => {
      if (!map[rule.class_type]) map[rule.class_type] = [];
      map[rule.class_type].push({
        field: rule.field,
        friendlyName: rule.friendly_name,
        autoCheck: rule.auto_check,
        priority: rule.priority,
        threshold: rule.threshold,
      });
    });
    // 对每个类型按优先级排序
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => a.priority - b.priority);
    });
    rulesCache = map;
    return map;
  } catch (e) {
    console.error('获取规则失败', e);
    return {};
  }
}

async function fetchStatsForClass(classType: string): Promise<{ field: string; count: number }[]> {
  try {
    const res = await apiClient.get('/suggestions/recommend', { params: { class_type: classType, limit: 100 } });
    return res.data;
  } catch {
    return [];
  }
}

export async function getSuggestionsForNode(nodeId: string, nodeData: any): Promise<Suggestion[]> {
  const cls = nodeData.class_type;
  const rulesByClass = await fetchRules();
  const ruleList = rulesByClass[cls] || [];

  // 获取统计数据
  const stats = await fetchStatsForClass(cls);
  const statMap = new Map(stats.map(s => [s.field, s.count]));

  const suggestions: Suggestion[] = [];

  // 处理规则中的字段
  ruleList.forEach(rule => {
    if (nodeData.inputs && rule.field in nodeData.inputs) {
      const statCount = statMap.get(rule.field) || 0;
      const autoCheck = rule.autoCheck || (statCount >= rule.threshold);
      suggestions.push({
        field: rule.field,
        friendlyName: rule.friendlyName,
        autoCheck,
      });
    }
  });

  // 处理统计中出现的但不在规则中的字段
  for (const stat of stats) {
    const field = stat.field;
    if (!nodeData.inputs || !(field in nodeData.inputs)) continue;
    if (suggestions.some(s => s.field === field)) continue; // 已存在
    // 使用默认阈值 1
    const autoCheck = stat.count >= 1;
    suggestions.push({
      field,
      friendlyName: field, // 暂时用字段名
      autoCheck,
    });
  }

  // 排序：规则中的按优先级已经排好，统计新增的按统计次数降序放在后面
  const ruleFields = new Set(ruleList.map(r => r.field));
  const ruleSuggestions = suggestions.filter(s => ruleFields.has(s.field));
  const statSuggestions = suggestions.filter(s => !ruleFields.has(s.field))
    .sort((a, b) => (statMap.get(b.field) || 0) - (statMap.get(a.field) || 0));

  return [...ruleSuggestions, ...statSuggestions];
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

export async function reportStats(stats: { class_type: string; field: string }[]) {
  try {
    await apiClient.post('/suggestions/report', { items: stats });
  } catch (e) {
    console.error('上报统计失败', e);
  }
}