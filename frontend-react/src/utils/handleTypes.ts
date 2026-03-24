/**
 * Handle 数据类型系统 —— 用于连线类型校验
 *
 * 类型: text | image | video | workflow | any
 * 规则: 相同类型可连，any 可连任何类型
 */

/** 根据节点类型、handle ID、节点数据，推断 handle 的数据类型 */
export function getHandleDataType(
  nodeType: string | undefined,
  handleId: string | undefined,
  nodeData: any,
  handleRole: 'source' | 'target'
): string {
  if (!handleId) return 'any';

  // ── Target handles (输入) ──
  if (handleRole === 'target') {
    if (handleId === 'text' || handleId === 'system') return 'text';
    if (handleId === 'image') return 'image';
    // ComfyUIEngineNode 动态参数端口: param-image → image, param-prompt → text
    if (handleId.startsWith('param-')) {
      return inferParamType(handleId.slice(6));
    }
    // ComfyUIEngineNode 的 in → workflow 类型
    if (nodeType === 'comfyUIEngine' && handleId === 'in') return 'workflow';
    // DisplayNode 的 in → 通用
    return 'any';
  }

  // ── Source handles (输出) ──
  if (nodeType === 'generate') {
    const mode = nodeData?.mode || 'chat';
    if (mode === 'chat' || mode === 'vision') return 'text';
    if (mode === 'text_to_image' || mode === 'image_to_image') return 'image';
    if (mode === 'text_to_video' || mode === 'image_to_video') return 'video';
    return 'any';
  }

  if (nodeType === 'loadAsset') {
    const assetType = nodeData?.asset?.type;
    if (assetType === 'prompt') return 'text';
    if (assetType === 'image') return 'image';
    if (assetType === 'video') return 'video';
    if (assetType === 'workflow') return 'workflow';
    return 'any';
  }

  // DisplayNode / ComfyUIEngineNode 输出 → any
  return 'any';
}

/** 两个类型是否兼容 */
export function areTypesCompatible(sourceType: string, targetType: string): boolean {
  if (sourceType === 'any' || targetType === 'any') return true;
  return sourceType === targetType;
}

/** 类型 → 中文标签 */
const TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  workflow: '工作流',
  any: '通用',
};

export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

/** 类型 → 颜色 */
const TYPE_COLORS: Record<string, string> = {
  text: '#52c41a',
  image: '#1890ff',
  video: '#eb2f96',
  workflow: '#722ed1',
  any: '#fa8c16',
};

export function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || '#fa8c16';
}

/** 从 ComfyUI 工作流参数名推断数据类型 */
const IMAGE_KEYWORDS = ['image', 'img', 'photo', 'picture', 'mask', 'ref_img'];
const VIDEO_KEYWORDS = ['video', 'clip'];
const TEXT_KEYWORDS = ['prompt', 'text', 'caption', 'description', 'negative', 'positive'];

export function inferParamType(paramName: string): string {
  const lower = paramName.toLowerCase();
  if (IMAGE_KEYWORDS.some(k => lower.includes(k))) return 'image';
  if (VIDEO_KEYWORDS.some(k => lower === k)) return 'video';
  if (TEXT_KEYWORDS.some(k => lower.includes(k))) return 'text';
  return 'any';
}
