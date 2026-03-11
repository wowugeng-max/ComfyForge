// frontend-react/src/components/nodes/GenerateNode.tsx
import React, { useState, useEffect, useRef } from 'react';
import { type NodeProps, useReactFlow, Handle, Position } from 'reactflow';
import { useParams } from 'react-router-dom';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Tooltip, Slider, Switch } from 'antd';
import { MessageOutlined, PictureOutlined, EyeOutlined, VideoCameraOutlined, DownOutlined, UpOutlined, StarFilled, SaveOutlined } from '@ant-design/icons';
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

          // 🌟 核心修复：重新打通数据瀑布！向下游推流
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
  }, [id, updateNodeData, setNodeStatus, getEdges]); // 🌟 依赖阵列加上 getEdges

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
    if (!selectedKey || !selectedModel) {
      setNodeStatus(id, 'error');
      return message.warning('请完整选择 Key 和 模型');
    }

    updateNodeData(id, { result: null });
    setGenerating(true);
    setProgressMsg('正在唤醒云端大脑...');
    setNodeStatus(id, 'running');

    try {
      const edges = getEdges();
      const nodes = getNodes();
      const incomingEdges = edges.filter(e => e.target === id);

      let finalPromptText = prompt;
      let incomingImage = '';
      let externalSystemPrompt = '';

      incomingEdges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          const sourceContent = sourceNode.data.result?.content || sourceNode.data.asset?.data?.content || sourceNode.data.asset?.data?.file_path || sourceNode.data.incoming_data?.content;
          if (edge.targetHandle === 'text' && sourceContent) {
             finalPromptText = finalPromptText ? `${finalPromptText}\n\n[参考素材]:\n${sourceContent}` : sourceContent;
          } else if (edge.targetHandle === 'image' && sourceContent && !incomingImage) {
             incomingImage = sourceContent.startsWith('http') || sourceContent.startsWith('data:') ? sourceContent : `http://localhost:8000/${sourceContent}`;
          } else if (edge.targetHandle === 'system' && sourceContent) {
             externalSystemPrompt = sourceContent;
          }
        }
      });

      if (!finalPromptText && !incomingImage) {
        setNodeStatus(id, 'error');
        setGenerating(false);
        return message.warning('请输入指令或连线素材节点');
      }

      const selectedProvider = keys.find(k => k.id === selectedKey)?.provider || data.provider;

      const payload: any = {
        api_key_id: selectedKey,
        provider: selectedProvider,
        model: selectedModel,
        type: mode,
        prompt: finalPromptText,
        params: { ...params, client_id: id }
      };

      if (incomingImage) payload.image_url = incomingImage;

      if (isAgentMode) {
        const activeSystemPrompt = externalSystemPrompt || SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].prompt;
        payload.messages = [{ role: "system", content: activeSystemPrompt }];

        if (mode === 'vision' && incomingImage) {
          payload.messages.push({
            role: "user",
            content: [
              { type: 'text', text: finalPromptText || "描述这张图片" },
              { type: 'image_url', image_url: { url: incomingImage } }
            ]
          });
        } else {
          payload.messages.push({ role: "user", content: finalPromptText || "开始执行" });
        }
      }

      await apiClient.request({ url: '/generate', method: 'POST', data: payload });

    } catch (error: any) {
      message.error(`生成报错: ${error.response?.data?.detail || '未知错误'}`);
      setNodeStatus(id, 'error');
      setGenerating(false);
      setProgressMsg('');
    }
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      let assetType = 'prompt';
      let assetData: Record<string, any> = { content: contentStr };
      let thumbnail: string | undefined = undefined;

      if (mode.includes('image') || contentStr.startsWith('http') || contentStr.startsWith('data:image')) {
        assetType = 'image';
        assetData = { file_path: contentStr, url: contentStr, content: contentStr };
        thumbnail = contentStr;
      } else if (mode.includes('video')) {
        assetType = 'video';
        assetData = { file_path: contentStr, url: contentStr, content: contentStr };
      }

      const briefPrompt = prompt.length > 0 ? prompt.substring(0, 10) : selectedModel;
      const assetName = `${assetType === 'image' ? '🖼️' : '📝'} ${briefPrompt}...`;

      await apiClient.post('/assets/', {
        name: assetName, type: assetType, data: assetData, tags: ['AI_Generated', mode, selectedModel],
        thumbnail: thumbnail, project_id: projectId ? Number(projectId) : null
      });
      message.success('已成功固化到本项目资产库！');
    } catch (error: any) {
      message.error(`入库失败: ${error.response?.data?.detail || '网络错误'}`);
    } finally { setSavingAsset(false); }
  };

  const renderParams = () => {
    const m = allModels.find(i => i.model_name === selectedModel);
    if (!m?.context_ui_params || !m.context_ui_params[mode]) return null;

    return m.context_ui_params[mode].map((p: any) => {
      const val = params[p.name] !== undefined ? params[p.name] : p.default;
      return (
        <div key={p.name} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, alignItems: 'center' }}>
            <Text type="secondary">{p.label}</Text>
            {p.type === 'number' && <Text type="secondary">{val}</Text>}
            {p.type === 'boolean' && (
              <Switch size="small" checked={!!val} onChange={v => {
                  const newParams = { ...params, [p.name]: v };
                  setParams(newParams); updateNodeData(id, { params: newParams });
              }} />
            )}
          </div>
          {p.type === 'select' && (
            <Select className="nodrag" size="small" style={{ width: '100%' }} value={val} options={p.options}
              onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />
          )}
          {p.type === 'number' && p.max <= 2 && (
            <Slider className="nodrag" min={p.min} max={p.max} step={p.step} value={val} style={{ margin: '0 8px' }}
              onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />
          )}
          {p.type === 'number' && p.max > 2 && (
            <InputNumber className="nodrag" size="small" style={{ width: '100%' }} value={val}
              onChange={v => { const newParams = { ...params, [p.name]: v }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />
          )}
          {(p.type === 'string' || p.type === 'text') && (
            <Input className="nodrag" size="small" style={{ width: '100%' }} value={val} placeholder={`如: ${p.default || ''}`}
              onChange={e => { const newParams = { ...params, [p.name]: e.target.value }; setParams(newParams); updateNodeData(id, { params: newParams }); }} />
          )}
        </div>
      );
    });
  };

  const renderDynamicHandles = () => {
    const handles = [];
    if (isAgentMode) {
        handles.push(<Tooltip key="sys-in" title="外挂预设 (System Prompt)" placement="left"><Handle type="target" position={Position.Left} id="system" style={{ top: 20, background: '#fadb14', width: 10, height: 10 }} /></Tooltip>);
    }
    handles.push(<Tooltip key="text-in" title="输入文本素材" placement="left"><Handle type="target" position={Position.Left} id="text" style={{ top: 50, background: '#52c41a', width: 10, height: 10 }} /></Tooltip>);
    if (mode === 'vision' || mode === 'image_to_image' || mode === 'image_to_video') {
      handles.push(<Tooltip key="img-in" title="输入参考图片" placement="left"><Handle type="target" position={Position.Left} id="image" style={{ top: 80, background: '#1890ff', width: 10, height: 10 }} /></Tooltip>);
    }
    return handles;
  };

  return (
    <BaseNode {...props}>
      {renderDynamicHandles()}
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0 }}>
          {isAgentMode && (
            <div style={{ marginBottom: 12, background: isRoleCollapsed ? '#f8fafc' : '#fff7e6', borderRadius: 6, border: isRoleCollapsed ? '1px solid #e2e8f0' : '1px solid #ffd591' }}>
              <div onClick={() => setIsRoleCollapsed(!isRoleCollapsed)} style={{ padding: '8px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                 <Text strong style={{ color: isRoleCollapsed ? '#64748b' : '#d46b08' }}>[ SYS.ROLE ]: {SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES]?.label.split(' ')}</Text>
                 {isRoleCollapsed ? <DownOutlined style={{ fontSize: 10 }}/> : <UpOutlined style={{ fontSize: 10, color: '#fa8c16' }}/>}
              </div>
              {!isRoleCollapsed && (
                 <div style={{ padding: '0 10px 10px 10px' }}>
                    <Select size="small" style={{ width: '100%', marginBottom: 6 }} value={selectedRole} onChange={v => { setSelectedRole(v); updateNodeData(id, { selectedRole: v }); }} options={Object.entries(SYSTEM_ROLES).map(([k, v]) => ({ label: v.label, value: k }))} />
                    <div style={{ background: '#fff', padding: 6, borderRadius: 4, border: '1px dashed #ffd591' }}><Text style={{ fontSize: 11, color: '#475569' }}>{SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES]?.prompt}</Text></div>
                 </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, background: '#f1f5f9', borderRadius: 6, padding: 4, border: '1px solid #e2e8f0' }}>
              {MODALITIES.map((m) => {
                const isActive = mode === m.id;
                return (
                  <div key={m.id} onClick={() => { setMode(m.id); setSelectedModel(''); setParams({}); }} style={{ textAlign: 'center', padding: '4px 0', cursor: 'pointer', borderRadius: 4, fontSize: 10, fontWeight: isActive ? 800 : 500, color: isActive ? '#fff' : '#64748b', background: isActive ? '#0ea5e9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    {m.icon} <span>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="nodrag" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Select placeholder="1. 选择云端算力" size="small" style={{ width: '100%' }} value={selectedKey || undefined} onChange={v => { setSelectedKey(v); setSelectedModel(''); }} options={keys.map(k => ({ label: `${k.provider} - ${k.description}`, value: k.id }))} />
          {loading ? <Spin size="small" /> : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <Select placeholder="2. 选择 AI 模型" size="small" style={{ flex: 1 }} value={selectedModel || undefined} onChange={v => {
                  setSelectedModel(v);
                  const m = allModels.find(i => i.model_name === v);
                  if(m?.context_ui_params && m.context_ui_params[mode]) {
                    const defs:any={};
                    m.context_ui_params[mode].forEach((p:any)=>defs[p.name]=p.default);
                    setParams(defs);
                  }
                }} disabled={!selectedKey} options={allModels.filter(m => showOnlyFavorites ? m.is_favorite : true).map(m => ({ label: (m.is_favorite && !showOnlyFavorites) ? `⭐ ${m.display_name}` : m.display_name, value: m.model_name }))} />
                <Tooltip title={showOnlyFavorites ? "显示常用" : "显示全量"}><Button type={showOnlyFavorites ? 'primary' : 'default'} icon={<StarFilled />} size="small" onClick={() => setShowOnlyFavorites(!showOnlyFavorites)} /></Tooltip>
              </div>

              {allModels.find(i => i.model_name === selectedModel)?.context_ui_params?.[mode] && (
                <div style={{ background: '#f8fafc', padding: '8px 8px 0 8px', borderRadius: 6, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                  {renderParams()}
                </div>
              )}
              <TextArea placeholder="输入指令或连线输入素材..." size="small" rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} style={{ fontFamily: 'monospace', background: '#fff' }} />
              <Button type="primary" size="small" block loading={generating} onClick={handleRun} style={{ marginTop: 'auto', flexShrink: 0, height: 32, fontWeight: 'bold' }}>
                {generating ? '正在思考...' : '单点运行'}
              </Button>

              <div className="nodrag" style={{ marginTop: 8, background: '#f8fafc', padding: 6, borderRadius: 6, border: '1px dashed #cbd5e1', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPreview ? 4 : 0 }}>
                  <Text style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>&gt; OUTPUT_PREVIEW</Text>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {data.result?.content && (
                      <Tooltip title="固化到当前项目资产库">
                        <Button type="text" size="small" icon={<SaveOutlined />} loading={savingAsset} onClick={handleSaveToAsset} style={{ fontSize: 14, color: '#0ea5e9', padding: 0, height: 'auto' }} />
                      </Tooltip>
                    )}
                    <Switch size="small" checked={showPreview} onChange={(v) => { setShowPreview(v); updateNodeData(id, { showPreview: v }); }} />
                  </div>

                </div>
                {showPreview && (
                  <div style={{ minHeight: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: 4, marginTop: 4, overflow: 'hidden', padding: generating ? 12 : 0 }}>
                    {generating ? (
                      <>
                        <Spin size="small" style={{ marginBottom: 8 }} />
                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 'bold', color: '#10b981' }}>{progressMsg}</Text>
                      </>
                    ) : data.result?.content ? (
                      (typeof data.result.content === 'string' && (data.result.content.startsWith('http') || data.result.content.startsWith('data:'))) ? (
                        data.result.type === 'video' || data.result.content.match(/\.(mp4|webm|mov|gif)(\?|$)/i) ? (
                          <video src={data.result.content} controls autoPlay loop muted style={{ width: '100%', objectFit: 'contain', borderRadius: 4 }} />
                        ) : (
                          <img src={data.result.content} style={{ width: '100%', objectFit: 'contain', borderRadius: 4 }} alt="Preview" />
                        )
                      ) : (
                        <div style={{ padding: 8, maxHeight: 150, overflowY: 'auto', fontSize: 11, color: '#475569', whiteSpace: 'pre-wrap', width: '100%', wordBreak: 'break-all' }}>
                          {data.result.content}
                        </div>
                      )
                    ) : (
                      <Text type="secondary" style={{ fontSize: 10, padding: '8px 0' }}>[ 等待生成结果... ]</Text>
                    )}
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#fa8c16', width: 12, height: 12 }} />
    </BaseNode>
  );
};

nodeRegistry.register({ type: 'generate', displayName: '🧠 AI 大脑', component: GenerateNode, defaultData: { label: '🧠 AI 大脑' } });
export default GenerateNode;