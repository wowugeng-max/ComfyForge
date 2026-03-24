// frontend-react/src/components/nodes/GenerateNode.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { type NodeProps, useReactFlow, useUpdateNodeInternals, Handle, Position } from 'reactflow';
import { useParams } from 'react-router-dom';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Tooltip, Slider, Switch, Tag, Space, Divider } from 'antd';
import { MessageOutlined, PictureOutlined, EyeOutlined, VideoCameraOutlined, StarFilled, SaveOutlined, StopOutlined, PlayCircleOutlined, SettingOutlined, CloseOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';
import { useAssetLibraryStore, type Asset } from '../../stores/assetLibraryStore';
import { getHandleDataType, getTypeLabel, getTypeColor } from '../../utils/handleTypes';
import AspectRatioSelector, { AspectRatioTrigger, AspectRatioPanel, ASPECT_RATIOS, getAspectRatioSize, getAspectRatioLabel, type AspectRatioValue } from '../AspectRatioSelector';
import CameraControl, { CameraTrigger, CameraPanel, buildCameraPromptSuffix, type CustomCameraOptions } from '../CameraControl';
import { CameraMovementTrigger, CameraMovementPanel, type CameraMovementPreset } from '../CameraMovement';

const { TextArea } = Input;
const { Text } = Typography;

// 一键预设：点击即创建到资产库
const PRESET_ROLES = [
  { label: '🔄 提示词优化大师', name: '提示词优化大师', prompt: '你是顶级 Prompt Engineer。把输入转化为极致详细的英文 Prompt，并给出负面 Prompt。' },
  { label: '📝 金牌编剧大师', name: '金牌编剧大师', prompt: '你是好莱坞金牌编剧。扩写场景描述，不仅要无中生有，还能解读现成的文本、小说、书籍等，极具画面感。并且要能一次性生成全部的剧本。' },
];

// 默认兜底角色（不存资产库，永远存在）
const DEFAULT_ROLE = { id: '_free_agent', name: '🧠 自由智能体', prompt: '你是一个万能 AI 助手，严格遵循用户指令。' };

const MODALITIES = [
  { id: 'chat', icon: <MessageOutlined />, label: 'CHAT' },
  { id: 'vision', icon: <EyeOutlined />, label: 'VISION' },
  { id: 'text_to_image', icon: <PictureOutlined />, label: 'T2I' },
  { id: 'image_to_image', icon: <PictureOutlined />, label: 'I2I' },
  { id: 'text_to_video', icon: <VideoCameraOutlined />, label: 'T2V' },
  { id: 'image_to_video', icon: <VideoCameraOutlined />, label: 'I2V' }
];

// 🔀 从 LLM 回复中提取 JSON 数组（容错：去除 markdown 代码块包裹）
function extractJsonArray(text: string): any[] | null {
  // 去除 ```json ... ``` 包裹
  let cleaned = text.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g, '$1').trim();
  // 尝试直接解析
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  // 尝试提取第一个 [...] 片段
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}



const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data, isConnectable } = props;
  const { id: projectId } = useParams<{ id: string }>();

  const updateNodeData = useCanvasStore(state => state.updateNodeData);
  const setNodeStatus = useCanvasStore(state => state.setNodeStatus);
  const fetchAssets = useAssetLibraryStore(state => state.fetchAssets);
  const { getEdges, getNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // 检查自身或父组是否静音
  const isMuted = useCanvasStore(state => {
    const self = state.nodes.find(n => n.id === id);
    if (self?.data?._muted) return true;
    if (!self?.parentNode) return false;
    const parent = state.nodes.find(n => n.id === self.parentNode);
    return !!parent?.data?._muted;
  });

  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<any[]>([]);
  const [allModels, setAllModels] = useState<any[]>([]);
  const [mediaDims, setMediaDims] = useState<string>('');

  const initialMode = ['chat', 'vision', 'text_to_image', 'image_to_image', 'text_to_video', 'image_to_video'].includes(data.mode) ? data.mode : 'chat';

  const [selectedKey, setSelectedKey] = useState<number | null>(data.api_key_id || null);
  const [mode, setMode] = useState<string>(initialMode);
  const [selectedModel, setSelectedModel] = useState<string>(data.model_name || '');
  const [prompt, setPrompt] = useState<string>(data.prompt || '');
  const [params, setParams] = useState<Record<string, any>>(data.params || {});

  const [generating, setGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [savingAsset, setSavingAsset] = useState(false);

  // 🌟 模式切换后通知 ReactFlow 更新 handle 注册（否则新出现的 handle 连不上线）
  useEffect(() => {
    updateNodeInternals(id);
  }, [mode, id, updateNodeInternals]);

  const [selectedRole, setSelectedRole] = useState<string>(data.selectedRole || DEFAULT_ROLE.id);
  const [isRoleCollapsed, setIsRoleCollapsed] = useState<boolean>(true);
  const [roleAssets, setRoleAssets] = useState<Asset[]>([]);

  // 从资产库加载 tag='SystemRole' 的 prompt 资产
  useEffect(() => {
    apiClient.get('/assets/?is_global=true').then(res => {
      const roles = res.data.filter((a: any) => a.type === 'prompt' && a.tags?.includes('SystemRole'));
      setRoleAssets(roles);
    }).catch(() => {});
  }, []);

  // 构建角色选项列表（兜底 + 资产库）
  const roleOptions = [
    { label: DEFAULT_ROLE.name, value: DEFAULT_ROLE.id, prompt: DEFAULT_ROLE.prompt },
    ...roleAssets.map(a => ({ label: a.name, value: String(a.id), prompt: a.data?.content || '' })),
  ];

  // 获取当前选中角色的 prompt
  const getSelectedRolePrompt = () => {
    const found = roleOptions.find(r => r.value === selectedRole);
    return found?.prompt || DEFAULT_ROLE.prompt;
  };

  // 一键创建预设角色到资产库（已存在则直接选中）
  const handleCreatePresetRole = async (preset: typeof PRESET_ROLES[0]) => {
    const existing = roleAssets.find(a => a.name === preset.name);
    if (existing) {
      setSelectedRole(String(existing.id));
      updateNodeData(id, { selectedRole: String(existing.id) });
      message.info(`「${preset.name}」已存在，已自动选中`);
      return;
    }
    try {
      const res = await apiClient.post('/assets/', {
        type: 'prompt', name: preset.name,
        data: { content: preset.prompt },
        tags: ['SystemRole'],
        project_id: null,
      });
      setRoleAssets(prev => [...prev, res.data]);
      setSelectedRole(String(res.data.id));
      updateNodeData(id, { selectedRole: String(res.data.id) });
      message.success(`「${preset.name}」已创建到资产库`);
    } catch { message.error('创建预设失败'); }
  };
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(data.showPreview ?? true);
  const [cameraParams, setCameraParams] = useState<Record<string, string>>(data.cameraParams || {});
  const [customCameraOptions, setCustomCameraOptions] = useState<CustomCameraOptions>(data.customCameraOptions || {});
  const [customMovements, setCustomMovements] = useState<CameraMovementPreset[]>(data.customMovements || []);
  const [aspectRatioValue, setAspectRatioValue] = useState<AspectRatioValue>({
    aspectRatio: data.aspectRatio || '',
    customWidth: data.customWidth || 1920,
    customHeight: data.customHeight || 1080,
  });
  const aspectRatio = aspectRatioValue.aspectRatio;
  const customWidth = aspectRatioValue.customWidth;
  const customHeight = aspectRatioValue.customHeight;
  const [configOpen, setConfigOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'ratio' | 'camera' | 'movement' | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // 计算浮层位置：节点 DOM 的屏幕坐标
  const updatePanelPos = useCallback(() => {
    if (!nodeRef.current) return;
    const rect = nodeRef.current.closest('.react-flow__node')?.getBoundingClientRect();
    if (!rect) return;
    setPanelPos({ top: rect.bottom + 8, left: rect.left });
  }, []);

  useEffect(() => {
    if (!configOpen) return;
    updatePanelPos();
    const canvas = document.querySelector('.react-flow__viewport');
    const observer = new MutationObserver(updatePanelPos);
    if (canvas) observer.observe(canvas, { attributes: true, attributeFilter: ['transform', 'style'] });
    window.addEventListener('resize', updatePanelPos);
    // 点击面板外部关闭
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-config-panel]') && !target.closest('.react-flow__node')) {
        setConfigOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePanelPos);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [configOpen, updatePanelPos]);

  const isAgentMode = mode === 'chat' || mode === 'vision';

  const prevSignalRef = useRef(data._runSignal);
  useEffect(() => {
    if (data._runSignal && data._runSignal !== prevSignalRef.current) {
      prevSignalRef.current = data._runSignal;
      handleRun();
    }
  }, [data._runSignal]);

  useEffect(() => { setMediaDims(''); }, [data.result?.content]);

  // WebSocket 连接 — 仅在节点 id 变化时建立，用 ref 保持稳定
  const wsRef = useRef<WebSocket | null>(null);
  const wsCallbacksRef = useRef({ updateNodeData, setNodeStatus, getEdges });
  wsCallbacksRef.current = { updateNodeData, setNodeStatus, getEdges };

  // 血缘上下文 ref，供 WebSocket 回调读取
  const lineageRef = useRef<Record<string, any>>({});
  useEffect(() => {
    const providerName = keys.find(k => k.id === selectedKey)?.provider || data.provider || '';
    const ratioSize = aspectRatio === 'custom' ? `${customWidth}*${customHeight}` : (aspectRatio ? ASPECT_RATIOS.find(r => r.value === aspectRatio)?.size : '');
    lineageRef.current = {
      source_provider: providerName,
      source_model: selectedModel,
      source_mode: mode,
      source_prompt: prompt,
      source_aspect_ratio: aspectRatio || null,
      source_size: ratioSize || null,
      source_camera_params: Object.keys(cameraParams).length > 0 ? cameraParams : null,
    };
  }, [keys, selectedKey, selectedModel, mode, prompt, aspectRatio, customWidth, customHeight, cameraParams, data.provider]);

  useEffect(() => {
    let wsURL = '';
    if (import.meta.env.DEV) {
      wsURL = `ws://127.0.0.1:8000/api/ws/${id}`;
    } else {
      const apiBaseURL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;
      wsURL = `${apiBaseURL.replace(/^http/, 'ws').replace(/\/$/, '')}/ws/${id}`;
    }
    const ws = new WebSocket(wsURL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { updateNodeData: upd, setNodeStatus: sns, getEdges: ge } = wsCallbacksRef.current;
        if (payload.type === 'status') {
          setProgressMsg(payload.message);
        } else if (payload.type === 'result') {
          setGenerating(false);
          setProgressMsg('');
          const resultWithLineage = typeof payload.data === 'object'
            ? { ...payload.data, ...lineageRef.current }
            : { content: payload.data, ...lineageRef.current };

          // 🔀 裂变输出：如果开启了裂变模式，尝试将结果解析为数组
          const nodeData = useCanvasStore.getState().nodes.find(n => n.id === id)?.data;
          const fissionEnabled = nodeData?._fissionEnabled;
          const expectedCountRaw = nodeData?._fissionExpectedCount;
          const expectedCount = Number.isFinite(Number(expectedCountRaw)) ? Number(expectedCountRaw) : null;
          let finalResult = resultWithLineage;

          if (fissionEnabled) {
            const contentStr = resultWithLineage.content || (typeof payload.data === 'string' ? payload.data : '');
            if (typeof contentStr === 'string' && contentStr.trim()) {
              try {
                // 尝试从 LLM 回复中提取 JSON 数组，并严格收敛为非空字符串数组
                const parsed = extractJsonArray(contentStr);
                const normalizedItems = Array.isArray(parsed)
                  ? parsed
                      .map((item) => {
                        if (typeof item === 'string') return item.trim();
                        if (item && typeof item === 'object') {
                          const candidate = (item as any).prompt ?? (item as any).text ?? (item as any).content ?? '';
                          return typeof candidate === 'string' ? candidate.trim() : '';
                        }
                        return '';
                      })
                      .filter((item) => item.length > 0)
                  : [];

                const countMatched = expectedCount === null || normalizedItems.length === expectedCount;

                if (normalizedItems.length > 1 && countMatched) {
                  finalResult = { ...resultWithLineage, _fission: true, items: normalizedItems };
                  console.log(`[GenerateNode] 🔀 裂变模式：解析出 ${normalizedItems.length} 个有效元素`);
                } else if (normalizedItems.length > 1 && !countMatched) {
                  message.warning(`裂变数量校验失败：期望 ${expectedCount} 条，实际 ${normalizedItems.length} 条，已回退普通输出`);
                  console.warn(`[GenerateNode] 裂变数量不匹配，expected=${expectedCount}, actual=${normalizedItems.length}`);
                } else if (parsed) {
                  console.warn('[GenerateNode] 裂变模式：JSON 数组有效元素不足，已回退普通输出');
                }
              } catch (e) {
                console.warn('[GenerateNode] 裂变解析失败，按普通结果处理', e);
              }
            }
          }

          upd(id, { result: finalResult });
          sns(id, 'success');
          message.success('🧠 AI 思考完成！');

          // 如果是裂变结果，不在这里推送下游（由 DAG 引擎裂变逻辑处理）
          if (!finalResult._fission) {
            const currentEdges = ge();
            currentEdges.filter(e => e.source === id).forEach(edge => {
              upd(edge.target, { incoming_data: finalResult });
            });
          }
        } else if (payload.type === 'error') {
          setGenerating(false);
          setProgressMsg('');
          setNodeStatus(id, 'error');
          message.error(payload.message);
        }
      } catch (e) {
        setGenerating(false);
        setNodeStatus(id, 'error');
      }
    };
    return () => { ws.close(); wsRef.current = null; };
  }, [id]);

  useEffect(() => {
    apiClient.get('/keys/').then(res => setKeys(res.data.filter((k: any) => k.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedKey) { setAllModels([]); return; }
    const fetchModels = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/models/?key_id=${selectedKey}&mode=${mode}`);
        setAllModels(res.data);
        if (!res.data.find((m: any) => m.model_name === selectedModel)) {
          setSelectedModel(''); setParams({});
        }
      } catch (err) {} finally { setLoading(false); }
    };
    fetchModels();
  }, [selectedKey, mode]);

  useEffect(() => {
    const selectedProvider = keys.find(k => k.id === selectedKey)?.provider;
    updateNodeData(id, { api_key_id: selectedKey, mode, model_name: selectedModel, prompt, params, selectedRole, showPreview, provider: selectedProvider, cameraParams, customMovements, aspectRatio, customWidth, customHeight });
  }, [selectedKey, mode, selectedModel, prompt, params, selectedRole, showPreview, cameraParams, customMovements, aspectRatio, customWidth, customHeight, id, updateNodeData, keys]);

  const handleRun = async () => {
    if (!selectedKey || !selectedModel) { setNodeStatus(id, 'error'); return message.warning('请完整选择 Key 和 模型'); }
    // 🌟 运行前，必须彻底清空旧状态
    updateNodeData(id, { result: null });
    setNodeStatus(id, 'running');
    setGenerating(true); setProgressMsg('正在唤醒云端大脑...'); setNodeStatus(id, 'running');

    try {
      const edges = getEdges(); const nodes = getNodes(); const incomingEdges = edges.filter(e => e.target === id);
      let finalPromptText = prompt; let incomingImage = ''; let externalSystemPrompt = '';

      incomingEdges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          const sourceContent = sourceNode.data.result?.content || sourceNode.data.asset?.data?.content || sourceNode.data.asset?.data?.file_path || sourceNode.data.incoming_data?.content;
          if (edge.targetHandle === 'text' && sourceContent) finalPromptText = finalPromptText ? `${finalPromptText}\n\n[参考素材]:\n${sourceContent}` : sourceContent;
          else if (edge.targetHandle === 'image' && sourceContent && !incomingImage) incomingImage = sourceContent.startsWith('http') || sourceContent.startsWith('data:') ? sourceContent : `http://localhost:8000/${sourceContent}`;
          else if (edge.targetHandle === 'system' && sourceContent) externalSystemPrompt = sourceContent;
        }
      });

      if (!finalPromptText && !incomingImage) { setNodeStatus(id, 'error'); setGenerating(false); return message.warning('请输入指令或连线素材节点'); }

      // 拼接摄像机参数到 prompt
      const cameraSuffix = buildCameraPromptSuffix(cameraParams);
      if (cameraSuffix) finalPromptText = (finalPromptText || '') + cameraSuffix;

      const selectedProvider = keys.find(k => k.id === selectedKey)?.provider || data.provider;
      const ratioSize = aspectRatio === 'custom' ? `${customWidth}*${customHeight}` : (aspectRatio ? ASPECT_RATIOS.find(r => r.value === aspectRatio)?.size : '');
      const payload: any = { api_key_id: selectedKey, provider: selectedProvider, model: selectedModel, type: mode, prompt: finalPromptText, params: { ...params, client_id: id, ...(ratioSize ? { size: ratioSize } : {}) } };
      if (incomingImage) payload.image_url = incomingImage;

      if (isAgentMode) {
        const activeSystemPrompt = externalSystemPrompt || data._systemPromptOverride || getSelectedRolePrompt();
        payload.messages = [{ role: "system", content: activeSystemPrompt }];
        if (mode === 'vision' && incomingImage) payload.messages.push({ role: "user", content: [{ type: 'text', text: finalPromptText || "描述这张图片" }, { type: 'image_url', image_url: { url: incomingImage } }] });
        else payload.messages.push({ role: "user", content: finalPromptText || "开始执行" });
      }

      updateNodeData(id, { _finalSourcePrompt: finalPromptText, _finalSystemPrompt: externalSystemPrompt || data._systemPromptOverride || getSelectedRolePrompt() });
      await apiClient.request({ url: '/generate', method: 'POST', data: payload });
    } catch (error: any) {
      message.error(`生成报错: ${error.response?.data?.detail || '未知错误'}`);
      setNodeStatus(id, 'error'); setGenerating(false); setProgressMsg('');
    }
  };

  // 🌟 Phase 10: 云端逻辑级中断机制
// 🌟 云端逻辑级中断机制：信任后端，死等报错包！
  const handleInterrupt = async () => {
    try {
      await apiClient.post(`/interrupt/${id}`);
      message.warning('已下发拦截指令，正在切断网络...');
    } catch (error) {
      message.error('拦截信令发送失败');
    }
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      const selectedProviderName = keys.find(k => k.id === selectedKey)?.provider || data.provider || '';
      const ratioSize = aspectRatio === 'custom' ? `${customWidth}*${customHeight}` : (aspectRatio ? ASPECT_RATIOS.find(r => r.value === aspectRatio)?.size : '');
      const cameraSuffix = buildCameraPromptSuffix(cameraParams);

      // 血缘追踪：完整记录生成上下文
      let assetType = 'prompt';
      let assetData: Record<string, any> = {
        content: contentStr,
        // 溯源核心
        source_provider: selectedProviderName,
        source_model: selectedModel,
        source_mode: mode,
        source_prompt: data._finalSourcePrompt,
        source_system: data._finalSystemPrompt,
        source_params: params,
        // 画面参数
        source_aspect_ratio: aspectRatio || null,
        source_size: ratioSize || null,
        source_camera_params: Object.keys(cameraParams).length > 0 ? cameraParams : null,
        source_camera_suffix: cameraSuffix || null,
      };
      let thumbnail: string | undefined = undefined;

      if (mode.includes('image') || contentStr.startsWith('http') || contentStr.startsWith('data:image')) {
        assetType = 'image'; assetData = { ...assetData, file_path: contentStr, url: contentStr }; thumbnail = contentStr;
      } else if (mode.includes('video')) {
        assetType = 'video'; assetData = { ...assetData, file_path: contentStr, url: contentStr };
      }

      const briefPrompt = prompt.length > 0 ? prompt.substring(0, 10) : selectedModel;
      const assetName = `${assetType === 'image' ? '🖼️' : assetType === 'video' ? '🎬' : '📝'} ${briefPrompt}...`;

      await apiClient.post('/assets/', { name: assetName, type: assetType, data: assetData, tags: ['AI_Generated', mode, selectedModel], thumbnail: thumbnail, project_id: projectId ? Number(projectId) : null });
      message.success('已携带【溯源信息】固化到资产库！');
      if (projectId) fetchAssets(Number(projectId));
    } catch (error: any) { message.error(`入库失败`); } finally { setSavingAsset(false); }
  };

  const renderParams = () => {
    const m = allModels.find(i => i.model_name === selectedModel);
    if (!m?.context_ui_params || !m.context_ui_params[mode]) return null;

    return m.context_ui_params[mode].map((p: any) => {
      const val = params[p.name] !== undefined ? params[p.name] : p.default;
      return (
        <div key={p.name} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, alignItems: 'center' }}>
            <Text type="secondary" style={{ color: '#475569', fontWeight: 600 }}>{p.label}</Text>
            {p.type === 'number' && <Text type="secondary" style={{ color: '#1890ff', fontWeight: 'bold' }}>{val}</Text>}
            {p.type === 'boolean' && <Switch className="nodrag" size="small" checked={!!val} onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />}
          </div>
          {/* 🌟 核心：为所有输入控件精准加上 className="nodrag"，防止滑动冲突 */}
          {p.type === 'select' && <Select className="nodrag" size="middle" style={{ width: '100%' }} value={val} options={p.options} onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />}
          {p.type === 'number' && p.max <= 2 && <Slider className="nodrag nowheel" min={p.min} max={p.max} step={p.step} value={val} style={{ margin: '0 8px' }} onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />}
          {p.type === 'number' && p.max > 2 && <InputNumber className="nodrag" size="middle" style={{ width: '100%' }} value={val} onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />}
          {(p.type === 'string' || p.type === 'text') && <Input className="nodrag" size="middle" style={{ width: '100%' }} value={val} placeholder={`如: ${p.default || ''}`} onChange={e => { const newParams = { ...params, [p.name]: e.target.value }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />}
        </div>
      );
    });
  };

  const renderDynamicHandles = () => {
    const handles = [];
    if (isAgentMode) handles.push(<Tooltip key="sys-in" title="外挂预设 (System Prompt)" placement="left"><Handle type="target" position={Position.Left} id="system" style={{ top: 30, background: '#fadb14', width: 12, height: 12 }} /></Tooltip>);
    handles.push(<Tooltip key="text-in" title="输入文本素材" placement="left"><Handle type="target" position={Position.Left} id="text" style={{ top: 70, background: '#52c41a', width: 12, height: 12 }} /></Tooltip>);
    if (mode === 'vision' || mode === 'image_to_image' || mode === 'image_to_video') handles.push(<Tooltip key="img-in" title="输入参考图片" placement="left"><Handle type="target" position={Position.Left} id="image" style={{ top: 110, background: '#1890ff', width: 12, height: 12 }} /></Tooltip>);
    return handles;
  };

  const currentModality = MODALITIES.find(m => m.id === mode);
  const currentModelDisplay = allModels.find(m => m.model_name === selectedModel)?.display_name || selectedModel || '未配置';

  const isImageVideoMode = ['text_to_image', 'image_to_image', 'text_to_video', 'image_to_video'].includes(mode);
  const isVideoMode = ['text_to_video', 'image_to_video'].includes(mode);
  const cameraSuffix = buildCameraPromptSuffix(cameraParams);

  // 裂变可视化保险：展示期望条数/解析条数
  const expectedFissionCount = Number.isFinite(Number(data._fissionExpectedCount)) ? Number(data._fissionExpectedCount) : null;
  const parsedFissionCount = (data.result?._fission && Array.isArray(data.result?.items)) ? data.result.items.length : 0;
  const isFissionCountHealthy = expectedFissionCount === null || parsedFissionCount === expectedFissionCount;

  // 当前比例显示


  const configPanel = configOpen && panelPos ? ReactDOM.createPortal(
    <div
      data-config-panel
      className="nodrag nowheel"
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        width: 560,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0',
        zIndex: 9999,
        padding: '12px 14px',
      }}
    >
      {/* Row 1: 模式选择 + 关闭按钮 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1, display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 2 }}>
          {MODALITIES.map(m => {
            const isActive = mode === m.id;
            return (
              <div key={m.id} onClick={() => { setMode(m.id); setSelectedModel(''); setParams({}); }}
                style={{ flex: 1, textAlign: 'center', padding: '5px 0', cursor: 'pointer', borderRadius: 6, fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? '#fff' : '#64748b', background: isActive ? '#0ea5e9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, transition: 'all 0.15s' }}>
                {m.icon} {m.label}
              </div>
            );
          })}
        </div>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setConfigOpen(false)} style={{ color: '#94a3b8', flexShrink: 0 }} />
      </div>

      {/* Row 2: 提示词大区域 */}
      <Input.TextArea
        placeholder="输入指令或连线输入素材..."
        autoSize={{ minRows: 4, maxRows: 10 }}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        style={{ fontSize: 13, fontFamily: 'monospace', borderRadius: 8, marginBottom: 10 }}
      />

      {/* Row 3: 模型厂商 + 模型 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
        <div style={{ width: 180 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 3 }}>模型厂商</Text>
          <Select
            size="small" placeholder="选择 Key" style={{ width: '100%' }}
            value={selectedKey || undefined}
            onChange={v => { setSelectedKey(v); setSelectedModel(''); }}
            options={keys.map(k => ({ label: k.provider, value: k.id }))}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 3 }}>模型</Text>
          {loading ? <Spin size="small" /> : (
            <div style={{ display: 'flex', gap: 4 }}>
              <Select
                size="small" placeholder="选择模型" style={{ flex: 1, minWidth: 0 }}
                value={selectedModel || undefined} disabled={!selectedKey}
                onChange={v => {
                  setSelectedModel(v);
                  const m = allModels.find(i => i.model_name === v);
                  if (m?.context_ui_params?.[mode]) { const defs: any = {}; m.context_ui_params[mode].forEach((p: any) => defs[p.name] = p.default); setParams(defs); }
                }}
                options={allModels.filter(m => showOnlyFavorites ? m.is_favorite : true).map(m => ({ label: (m.is_favorite && !showOnlyFavorites) ? `⭐ ${m.display_name}` : m.display_name, value: m.model_name }))}
              />
              <Tooltip title={showOnlyFavorites ? '显示全量' : '只看收藏'}>
                <Button size="small" type={showOnlyFavorites ? 'primary' : 'default'} icon={<StarFilled />} onClick={() => setShowOnlyFavorites(!showOnlyFavorites)} />
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: 底部工具行 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* 提示词大师（仅 chat/vision） */}
        {isAgentMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Select
              size="small" style={{ width: 150 }} value={selectedRole}
              onChange={v => { setSelectedRole(v); updateNodeData(id, { selectedRole: v }); }}
              options={roleOptions}
            />
            {PRESET_ROLES.map(preset => (
              <Tag key={preset.name} color="orange" style={{ cursor: 'pointer', fontSize: 10, margin: 0, lineHeight: '20px' }} onClick={() => handleCreatePresetRole(preset)}>
                {preset.label}
              </Tag>
            ))}
          </div>
        )}

        {/* 动态参数 */}
        {allModels.find(i => i.model_name === selectedModel)?.context_ui_params?.[mode] && (
          <div style={{ background: '#f8fafc', padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {renderParams()}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }} />

        {/* 比例 + 摄像机 触发按钮（仅图像/视频模式） */}
        {isImageVideoMode && (
          <AspectRatioTrigger value={aspectRatioValue} onClick={() => setActivePanel(activePanel === 'ratio' ? null : 'ratio')} />
        )}
        {isImageVideoMode && (
          <CameraTrigger value={cameraParams} onClick={() => setActivePanel(activePanel === 'camera' ? null : 'camera')} />
        )}
        {isVideoMode && (
          <CameraMovementTrigger onClick={() => setActivePanel(activePanel === 'movement' ? null : 'movement')} />
        )}
      </div>

      {/* 展开面板（互斥，只开一个） */}
      {isImageVideoMode && activePanel === 'ratio' && (
        <AspectRatioPanel value={aspectRatioValue} onChange={setAspectRatioValue} onClose={() => setActivePanel(null)} />
      )}
      {isImageVideoMode && activePanel === 'camera' && (
        <CameraPanel value={cameraParams} onChange={setCameraParams} onClose={() => setActivePanel(null)}
          customOptions={customCameraOptions}
          onCustomOptionsChange={(v) => { setCustomCameraOptions(v); updateNodeData(id, { customCameraOptions: v }); }}
        />
      )}
      {isVideoMode && activePanel === 'movement' && (
        <CameraMovementPanel
          onInsert={(text) => setPrompt(prev => prev ? `${prev}, ${text}` : text)}
          onClose={() => setActivePanel(null)}
          customPresets={customMovements}
          onAddCustom={(preset) => { const updated = [...customMovements, preset]; setCustomMovements(updated); updateNodeData(id, { customMovements: updated }); }}
          onRemoveCustom={(value) => { const updated = customMovements.filter(m => m.value !== value); setCustomMovements(updated); updateNodeData(id, { customMovements: updated }); }}
        />
      )}

    </div>,
    document.body
  ) : null;

  return (
    <BaseNode {...props} onOpenConfig={() => { setConfigOpen(v => !v); }}>
      {renderDynamicHandles()}

      {/* ── 紧凑视图 ── */}
      <div ref={nodeRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* 模式 badge + 模型名 + 裂变开关 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Tag color="#0ea5e9" style={{ margin: 0, fontWeight: 700, fontSize: 11, letterSpacing: 1, fontFamily: 'monospace' }}>
            {currentModality?.label || mode.toUpperCase()}
          </Tag>
          <Text style={{ fontSize: 12, color: selectedModel ? '#1e293b' : '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={currentModelDisplay}>
            {currentModelDisplay}
          </Text>
          {(mode === 'chat' || mode === 'vision') && (
            <>
              <Tooltip title="裂变输出：LLM 返回 JSON 数组时自动裂变下游节点并发执行">
                <Tag
                  className="nodrag"
                  color={data._fissionEnabled ? '#f59e0b' : undefined}
                  style={{ margin: 0, cursor: 'pointer', fontSize: 11, userSelect: 'none' }}
                  onClick={() => updateNodeData(id, { _fissionEnabled: !data._fissionEnabled })}
                >
                  {data._fissionEnabled ? '🔀 裂变' : '裂变'}
                </Tag>
              </Tooltip>

              {data._fissionEnabled && (
                <Tooltip title={expectedFissionCount !== null ? `裂变计数校验：期望 ${expectedFissionCount} 条，当前解析 ${parsedFissionCount} 条` : '裂变计数校验：未设置期望条数'}>
                  <Tag
                    style={{ margin: 0, fontSize: 11, userSelect: 'none' }}
                    color={isFissionCountHealthy ? 'green' : 'red'}
                  >
                    {expectedFissionCount !== null ? `${parsedFissionCount}/${expectedFissionCount}` : `${parsedFissionCount}/?`}
                  </Tag>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {/* Prompt 输入框（小版） */}
        <TextArea
          className="nodrag nowheel"
          placeholder="输入指令或连线输入素材..."
          autoSize={{ minRows: 2, maxRows: 4 }}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          style={{ fontSize: 13, fontFamily: 'monospace', background: '#fff', borderRadius: 8, flexShrink: 0 }}
        />

        {/* 运行 / 中止按钮 */}
        <Button
          type="primary" danger={generating} block
          icon={generating ? <StopOutlined /> : <PlayCircleOutlined />}
          onClick={generating ? handleInterrupt : handleRun}
          disabled={isMuted}
          style={{ flexShrink: 0, height: 36, fontSize: 13, fontWeight: 'bold' }}
        >
          {isMuted ? '已静音' : generating ? '强行中止' : '单点运行'}
        </Button>

        {/* OUTPUT_PREVIEW */}
        <div style={{ flex: showPreview ? 1 : '0 0 auto', display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px dashed #94a3b8', minHeight: showPreview ? 120 : 'auto', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>&gt; OUTPUT_PREVIEW</Text>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {data.result?.content && (
                <Tooltip title="携带血统溯源固化到资产库">
                  <Button type="text" size="small" icon={<SaveOutlined />} loading={savingAsset} onClick={handleSaveToAsset} style={{ fontSize: 16, color: '#0ea5e9', padding: 0, height: 'auto' }} />
                </Tooltip>
              )}
              <Switch className="nodrag" size="small" checked={showPreview} onChange={v => { setShowPreview(v); updateNodeData(id, { showPreview: v }); }} />
            </div>
          </div>

          {showPreview && (
            <div style={{ flex: 1, position: 'relative', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
              {mediaDims && !generating && data.result?.content && (
                <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)', color: '#f8fafc', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, zIndex: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {mediaDims}
                </div>
              )}
              {generating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
                  <Spin size="default" style={{ marginBottom: 12 }} />
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 'bold', color: '#10b981' }}>{progressMsg}</Text>
                </div>
              ) : data.result?.content ? (
                (typeof data.result.content === 'string' && (data.result.content.startsWith('http') || data.result.content.startsWith('data:'))) ? (
                  data.result.type === 'video' || data.result.content.match(/\.(mp4|webm|mov|gif)(\?|$)/i) ? (
                    <video src={data.result.content} controls autoPlay loop muted style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} onLoadedMetadata={e => setMediaDims(`${(e.target as HTMLVideoElement).videoWidth} × ${(e.target as HTMLVideoElement).videoHeight}`)} />
                  ) : (
                    <img src={data.result.content} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} alt="Preview" onLoad={e => setMediaDims(`${(e.target as HTMLImageElement).naturalWidth} × ${(e.target as HTMLImageElement).naturalHeight}`)} />
                  )
                ) : (
                  <div className="nodrag nowheel" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', padding: 12, overflowY: 'auto', fontSize: 13, color: '#f8fafc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {data.result.content}
                  </div>
                )
              ) : (
                <Text type="secondary" style={{ fontSize: 13, color: '#475569' }}>等待生成结果...</Text>
              )}
            </div>
          )}
        </div>
      </div>

      <Tooltip title={`${getTypeLabel(getHandleDataType('generate', 'out', data, 'source'))}输出`} placement="right">
        <Handle type="source" position={Position.Right} id="out" style={{ background: getTypeColor(getHandleDataType('generate', 'out', data, 'source')), width: 12, height: 12 }} />
      </Tooltip>

      {configPanel}
    </BaseNode>
  );
};

nodeRegistry.register({ type: 'generate', displayName: '🧠 AI 大脑', component: GenerateNode, defaultData: { label: '🧠 AI 大脑' } });
export default GenerateNode;