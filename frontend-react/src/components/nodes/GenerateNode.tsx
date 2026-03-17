// frontend-react/src/components/nodes/GenerateNode.tsx
import React, { useState, useEffect, useRef } from 'react';
import { type NodeProps, useReactFlow, Handle, Position } from 'reactflow';
import { useParams } from 'react-router-dom';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Tooltip, Slider, Switch } from 'antd';
import { MessageOutlined, PictureOutlined, EyeOutlined, VideoCameraOutlined, DownOutlined, UpOutlined, StarFilled, SaveOutlined,StopOutlined, PlayCircleOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

const { TextArea } = Input;
const { Text } = Typography;

const SYSTEM_ROLES = {
  'free_agent': { label: '🧠 自由智能体', prompt: '你是一个万能 AI 助手，严格遵循用户指令。' },
  'storyboard': { label: '🎬 分镜大师', prompt: '你是顶级分镜导演。严格按剧本输出分镜画面描述，用极简英文 Tag 格式，便于直接转 ComfyUI/SD。' },
  'fashion': { label: '👗 服饰设计大师', prompt: '你是时尚设计师。输出服装设计，并生成英文 Prompt。' },
  'script': { label: '📝 好莱坞金牌编剧', prompt: '你是好莱坞金牌编剧。扩写场景描述，不仅要无中生有，还能解读现成的文本、小说、书籍等，极具画面感。并且要能一次性生成全部的剧本。' },
  'prompt_engineer': { label: '🔄 提示词优化大师', prompt: '你是顶级 Prompt Engineer。把输入转化为极致详细的英文 Prompt，并给出负面 Prompt。' },
  'translator': { label: '🌍 中英双语翻译官', prompt: '专业本地化翻译。把中文翻译成最适合 AI 生成的英文，自动添加 highly detailed 等画质词。' }
};

const MODALITIES = [
  { id: 'chat', icon: <MessageOutlined />, label: 'CHAT' },
  { id: 'vision', icon: <EyeOutlined />, label: 'VISION' },
  { id: 'text_to_image', icon: <PictureOutlined />, label: 'T2I' },
  { id: 'image_to_image', icon: <PictureOutlined />, label: 'I2I' },
  { id: 'text_to_video', icon: <VideoCameraOutlined />, label: 'T2V' },
  { id: 'image_to_video', icon: <VideoCameraOutlined />, label: 'I2V' }
];

const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data, isConnectable } = props;
  const { id: projectId } = useParams<{ id: string }>();

  const updateNodeData = useCanvasStore(state => state.updateNodeData);
  const setNodeStatus = useCanvasStore(state => state.setNodeStatus);
  const { getEdges, getNodes } = useReactFlow();

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

  const [selectedRole, setSelectedRole] = useState<string>(data.selectedRole || 'free_agent');
  const [isRoleCollapsed, setIsRoleCollapsed] = useState<boolean>(true);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(data.showPreview ?? true);

  const isAgentMode = mode === 'chat' || mode === 'vision';

  const prevSignalRef = useRef(data._runSignal);
  useEffect(() => {
    if (data._runSignal && data._runSignal !== prevSignalRef.current) {
      prevSignalRef.current = data._runSignal;
      handleRun();
    }
  }, [data._runSignal]);

  useEffect(() => { setMediaDims(''); }, [data.result?.content]);

  useEffect(() => {
    let wsURL = '';
    if (import.meta.env.DEV) {
      wsURL = `ws://127.0.0.1:8000/api/ws/${id}`;
    } else {
      const apiBaseURL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;
      wsURL = `${apiBaseURL.replace(/^http/, 'ws').replace(/\/$/, '')}/ws/${id}`;
    }
    const ws = new WebSocket(wsURL);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'status') {
          setProgressMsg(payload.message);
        } else if (payload.type === 'result') {
          setGenerating(false);
          setProgressMsg('');
          updateNodeData(id, { result: payload.data });
          setNodeStatus(id, 'success');
          message.success('🧠 AI 思考完成！');

          const currentEdges = getEdges();
          currentEdges.filter(e => e.source === id).forEach(edge => {
            updateNodeData(edge.target, { incoming_data: payload.data });
          });
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
    return () => ws.close();
  }, [id, updateNodeData, setNodeStatus, getEdges]);

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
    updateNodeData(id, { api_key_id: selectedKey, mode, model_name: selectedModel, prompt, params, selectedRole, showPreview, provider: selectedProvider });
  }, [selectedKey, mode, selectedModel, prompt, params, selectedRole, showPreview, id, updateNodeData, keys]);

  const handleRun = async () => {
    if (!selectedKey || !selectedModel) { setNodeStatus(id, 'error'); return message.warning('请完整选择 Key 和 模型'); }
    updateNodeData(id, { result: null });
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

      const selectedProvider = keys.find(k => k.id === selectedKey)?.provider || data.provider;
      const payload: any = { api_key_id: selectedKey, provider: selectedProvider, model: selectedModel, type: mode, prompt: finalPromptText, params: { ...params, client_id: id } };
      if (incomingImage) payload.image_url = incomingImage;

      if (isAgentMode) {
        const activeSystemPrompt = externalSystemPrompt || SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].prompt;
        payload.messages = [{ role: "system", content: activeSystemPrompt }];
        if (mode === 'vision' && incomingImage) payload.messages.push({ role: "user", content: [{ type: 'text', text: finalPromptText || "描述这张图片" }, { type: 'image_url', image_url: { url: incomingImage } }] });
        else payload.messages.push({ role: "user", content: finalPromptText || "开始执行" });
      }

      updateNodeData(id, { _finalSourcePrompt: finalPromptText, _finalSystemPrompt: externalSystemPrompt || SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].prompt });
      await apiClient.request({ url: '/generate', method: 'POST', data: payload });
    } catch (error: any) {
      message.error(`生成报错: ${error.response?.data?.detail || '未知错误'}`);
      setNodeStatus(id, 'error'); setGenerating(false); setProgressMsg('');
    }
  };

  // 🌟 Phase 10: 云端逻辑级中断机制
  const handleInterrupt = async () => {
    try {
      await apiClient.post(`/interrupt/${id}`);
      message.success('已下发拦截指令，正在切断云端网络...');
    } catch (error) {
      message.error('拦截信令发送失败');
    } finally {
      // 🌟 强行自救，解除红色锁定
      setGenerating(false);
      setNodeStatus(id, 'idle');
    }
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      let assetType = 'prompt';
      let assetData: Record<string, any> = { content: contentStr, source_model: selectedModel, source_prompt: data._finalSourcePrompt, source_system: data._finalSystemPrompt, source_params: params };
      let thumbnail: string | undefined = undefined;

      if (mode.includes('image') || contentStr.startsWith('http') || contentStr.startsWith('data:image')) {
        assetType = 'image'; assetData = { ...assetData, file_path: contentStr, url: contentStr }; thumbnail = contentStr;
      } else if (mode.includes('video')) {
        assetType = 'video'; assetData = { ...assetData, file_path: contentStr, url: contentStr };
      }

      const briefPrompt = prompt.length > 0 ? prompt.substring(0, 10) : selectedModel;
      const assetName = `${assetType === 'image' ? '🖼️' : '📝'} ${briefPrompt}...`;

      await apiClient.post('/assets/', { name: assetName, type: assetType, data: assetData, tags: ['AI_Generated', mode, selectedModel], thumbnail: thumbnail, project_id: projectId ? Number(projectId) : null });
      message.success('已携带【溯源信息】固化到资产库！');
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

  return (
    <BaseNode {...props}>
      {renderDynamicHandles()}
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* 🌟 移除大区块容器的 nodrag，只在可滚动区域加 nowheel 防冲突 */}
        <div className="nowheel" style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: 4, gap: 10, minHeight: 120 }}>
          <div style={{ flexShrink: 0 }}>
            {isAgentMode && (
              <div style={{ marginBottom: 12, background: isRoleCollapsed ? '#f8fafc' : '#fff7e6', borderRadius: 8, border: isRoleCollapsed ? '1px solid #cbd5e1' : '1px solid #ffd591' }}>
                <div onClick={() => setIsRoleCollapsed(!isRoleCollapsed)} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ color: isRoleCollapsed ? '#475569' : '#d46b08' }}>[ SYS.ROLE ]: {SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES]?.label.split(' ')}</Text>
                  {isRoleCollapsed ? <DownOutlined style={{ fontSize: 10 }}/> : <UpOutlined style={{ fontSize: 10, color: '#fa8c16' }}/>}
                </div>
                {!isRoleCollapsed && (
                  <div style={{ padding: '0 12px 12px 12px' }}>
                      <Select className="nodrag" size="middle" style={{ width: '100%', marginBottom: 6 }} value={selectedRole} onChange={v => { setSelectedRole(v); updateNodeData(id, { selectedRole: v }); }} options={Object.entries(SYSTEM_ROLES).map(([k, v]) => ({ label: v.label, value: k }))} />
                      <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px dashed #ffd591' }}><Text style={{ fontSize: 13, color: '#475569' }}>{SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES]?.prompt}</Text></div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, background: '#f1f5f9', borderRadius: 8, padding: 6, border: '1px solid #cbd5e1' }}>
                {MODALITIES.map((m) => {
                  const isActive = mode === m.id;
                  return (
                    <div key={m.id} onClick={() => { setMode(m.id); setSelectedModel(''); setParams({}); }} style={{ textAlign: 'center', padding: '6px 0', cursor: 'pointer', borderRadius: 6, fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? '#fff' : '#64748b', background: isActive ? '#0ea5e9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {m.icon} <span>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <Select className="nodrag" placeholder="1. 选择云端算力" size="middle" style={{ width: '100%', flexShrink: 0 }} value={selectedKey || undefined} onChange={v => { setSelectedKey(v); setSelectedModel(''); }} options={keys.map(k => ({ label: `${k.provider} - ${k.description}`, value: k.id }))} />
          {loading ? <Spin size="small" /> : (
            <>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Select className="nodrag" placeholder="2. 选择 AI 模型" size="middle" style={{ flex: 1 }} value={selectedModel || undefined} onChange={v => {
                  setSelectedModel(v); const m = allModels.find(i => i.model_name === v);
                  if(m?.context_ui_params && m.context_ui_params[mode]) { const defs:any={}; m.context_ui_params[mode].forEach((p:any)=>defs[p.name]=p.default); setParams(defs); }
                }} disabled={!selectedKey} options={allModels.filter(m => showOnlyFavorites ? m.is_favorite : true).map(m => ({ label: (m.is_favorite && !showOnlyFavorites) ? `⭐ ${m.display_name}` : m.display_name, value: m.model_name }))} />
                <Tooltip title={showOnlyFavorites ? "显示常用" : "显示全量"}><Button type={showOnlyFavorites ? 'primary' : 'default'} icon={<StarFilled />} style={{ height: 32 }} onClick={() => setShowOnlyFavorites(!showOnlyFavorites)} /></Tooltip>
              </div>

              {allModels.find(i => i.model_name === selectedModel)?.context_ui_params?.[mode] && (
                <div style={{ background: '#f8fafc', padding: '12px 12px 0 12px', borderRadius: 8, border: '1px solid #cbd5e1', flexShrink: 0 }}>
                  {renderParams()}
                </div>
              )}
              <TextArea className="nodrag nowheel" placeholder="输入指令或连线输入素材..." autoSize={{ minRows: 4, maxRows: 8 }} value={prompt} onChange={e => setPrompt(e.target.value)} style={{ fontSize: 13, fontFamily: 'monospace', background: '#fff', borderRadius: 8, flexShrink: 0 }} />
            </>
          )}
        </div>

{/* 🌟 Phase 10：AI大脑拦截按钮 */}
        <Button
          type="primary"
          danger={generating}
          block
          icon={generating ? <StopOutlined /> : <PlayCircleOutlined />}
          onClick={generating ? handleInterrupt : handleRun}
          style={{ flexShrink: 0, margin: '12px 0', height: 40, fontSize: 15, fontWeight: 'bold' }}
        >
          {generating ? '强行中止 (切断网络连接)' : '单点运行'}
        </Button>

        {/* 🌟 同样移除下半区的 nodrag */}
        <div style={{ flex: showPreview ? '1 1 50%' : '0 0 auto', display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px dashed #94a3b8', minHeight: showPreview ? 140 : 'auto', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <Text style={{ fontSize: 13, color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>&gt; OUTPUT_PREVIEW</Text>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {data.result?.content && (
                <Tooltip title="携带血统溯源固化到资产库">
                  <Button type="text" size="small" icon={<SaveOutlined />} loading={savingAsset} onClick={handleSaveToAsset} style={{ fontSize: 18, color: '#0ea5e9', padding: 0, height: 'auto' }} />
                </Tooltip>
              )}
              <Switch className="nodrag" size="small" checked={showPreview} onChange={(v) => { setShowPreview(v); updateNodeData(id, { showPreview: v }); }} />
            </div>
          </div>

          {showPreview && (
            <div style={{ flex: 1, position: 'relative', background: '#0f172a', borderRadius: 8, overflow: 'hidden', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {mediaDims && !generating && data.result?.content && (
                <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#f8fafc', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, zIndex: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {mediaDims}
                </div>
              )}
              {generating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Spin size="default" style={{ marginBottom: 12 }} />
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 'bold', color: '#10b981' }}>{progressMsg}</Text>
                </div>
              ) : data.result?.content ? (
                (typeof data.result.content === 'string' && (data.result.content.startsWith('http') || data.result.content.startsWith('data:'))) ? (
                  data.result.type === 'video' || data.result.content.match(/\.(mp4|webm|mov|gif)(\?|$)/i) ? (
                    <video src={data.result.content} controls autoPlay loop muted style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} onLoadedMetadata={(e) => setMediaDims(`${(e.target as HTMLVideoElement).videoWidth} × ${(e.target as HTMLVideoElement).videoHeight}`)} />
                  ) : (
                    <img src={data.result.content} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'high-quality' }} alt="Preview" onLoad={(e) => setMediaDims(`${(e.target as HTMLImageElement).naturalWidth} × ${(e.target as HTMLImageElement).naturalHeight}`)} />
                  )
                ) : (
                  // 🌟 文字显示区域保留 nodrag nowheel
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
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#fa8c16', width: 12, height: 12 }} />
    </BaseNode>
  );
};

nodeRegistry.register({ type: 'generate', displayName: '🧠 AI 大脑', component: GenerateNode, defaultData: { label: '🧠 AI 大脑' } });
export default GenerateNode;