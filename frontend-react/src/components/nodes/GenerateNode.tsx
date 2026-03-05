import React, { useState, useEffect } from 'react';
import { type NodeProps, useReactFlow, Handle, Position } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Segmented, Space, Slider, Tooltip } from 'antd';
import { MessageOutlined, PictureOutlined, EyeOutlined, VideoCameraOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

const { TextArea } = Input;
const { Text } = Typography;

// 🌟 预设金牌角色
const SYSTEM_ROLES = {
  'free_agent': { label: '🧠 自由智能体', prompt: '你是一个万能 AI 助手，严格遵循用户指令。' },
  'storyboard': { label: '🎬 分镜大师', prompt: '你是顶级分镜导演。严格按剧本输出分镜画面描述，用极简英文 Tag 格式，便于直接转 ComfyUI/SD。' },
  'fashion': { label: '👗 服装设计大师', prompt: '你是时尚设计师。输出服装设计，并生成英文 Prompt。' },
  'script': { label: '📝 剧本扩写大师', prompt: '你是金牌编剧。扩写场景描述，极具画面感。' },
  'prompt_engineer': { label: '🔄 提示词优化大师', prompt: '你是顶级 Prompt Engineer。把输入转化为极致详细的英文 Prompt，并给出负面 Prompt。' },
  'translator': { label: '🌍 中英双语翻译官', prompt: '专业本地化翻译。把中文翻译成最适合 AI 生成的英文，自动添加 highly detailed 等画质词。' }
};

const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data, isConnectable } = props;
  const { updateNodeData } = useCanvasStore();
  const { getEdges, getNodes, setNodes } = useReactFlow();

  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<any[]>([]);
  const [allModels, setAllModels] = useState<any[]>([]);

  // 节点内部状态
  const [selectedKey, setSelectedKey] = useState<number | null>(data.api_key_id || null);
  const [mode, setMode] = useState<string>(data.mode || 'chat');
  const [selectedModel, setSelectedModel] = useState<string>(data.model_name || '');
  const [prompt, setPrompt] = useState<string>(data.prompt || '');
  const [params, setParams] = useState<Record<string, any>>(data.params || {});
  const [generating, setGenerating] = useState(false);

  const [selectedRole, setSelectedRole] = useState<string>(data.selectedRole || 'free_agent');
  const [isRoleCollapsed, setIsRoleCollapsed] = useState<boolean>(true);

  // 🌟 核心定义：智能体降级判断
  const isAgentMode = mode === 'chat' || mode === 'vision';

  useEffect(() => {
    apiClient.get('/keys/').then(res => setKeys(res.data.filter((k: any) => k.is_active))).catch(() => message.error('获取 API Key 失败'));
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
    updateNodeData(id, { api_key_id: selectedKey, mode, model_name: selectedModel, prompt, params, selectedRole });
  }, [selectedKey, mode, selectedModel, prompt, params, selectedRole, id, updateNodeData]);

  const handleKeyChange = (val: number) => { setSelectedKey(val); setSelectedModel(''); setParams({}); };

  const handleModelChange = (val: string) => {
    setSelectedModel(val);
    const m = allModels.find(i => i.model_name === val);
    if (m?.context_ui_params && m.context_ui_params[mode]) {
      const defaults: any = {};
      m.context_ui_params[mode].forEach((p: any) => defaults[p.name] = p.default);
      setParams(defaults);
    }
  };

  const handleRun = async () => {
    if (!selectedKey || !selectedModel) return message.warning('请完整选择 Key 和 模型');
    setGenerating(true);

    try {
      const edges = getEdges();
      const nodes = getNodes();
      const incomingEdges = edges.filter(e => e.target === id);

      let finalPromptText = prompt;
      let incomingImages: string[] = [];
      let externalSystemPrompt = '';

      incomingEdges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          // 🌟 核心：从资产、上个大脑结果、展示节点吸取数据
          const sourceContent = sourceNode.data.result?.content || sourceNode.data.asset?.data?.content || sourceNode.data.asset?.data?.file_path || sourceNode.data.incoming_data?.content;

          if (edge.targetHandle === 'text' && sourceContent) {
             finalPromptText = finalPromptText ? `${finalPromptText}\n\n[前置参考素材]:\n${sourceContent}` : sourceContent;
          } else if (edge.targetHandle === 'image' && sourceContent) {
             const imgData = sourceContent.startsWith('http') || sourceContent.startsWith('data:') ? sourceContent : `http://localhost:8000/${sourceContent}`;
             incomingImages.push(imgData);
          } else if (edge.targetHandle === 'system' && sourceContent) {
             externalSystemPrompt = sourceContent;
          }
        }
      });

      if (!finalPromptText && incomingImages.length === 0) {
        return message.warning('请输入指令或连接素材节点');
      }

      if (!isAgentMode && finalPromptText && finalPromptText.length > 500) {
          message.info('💡 提示：检测到您的绘图/视频输入文本较长，建议先在前面串联一个【提示词优化大师】节点提取核心 Tag 哦！', 6);
      }

      let payloadPrompt: any;

      if (isAgentMode) {
        const activeSystemPrompt = externalSystemPrompt || SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].prompt;
        let messagesPayload: any[] = [{ role: "system", content: activeSystemPrompt }];

        if (mode === 'vision' && incomingImages.length > 0) {
           messagesPayload.push({
              role: "user",
              content: [
                 { type: 'text', text: finalPromptText || "请处理这张图片" },
                 ...incomingImages.map(img => ({ type: 'image', data: img }))
              ]
           });
        } else {
           messagesPayload.push({ role: "user", content: finalPromptText || "开始执行" });
        }
        payloadPrompt = JSON.stringify(messagesPayload);
      } else {
        if (incomingImages.length > 0) {
             const rendererPayload = [
                { type: 'text', text: finalPromptText || "" },
                ...incomingImages.map(img => ({ type: 'image', data: img }))
             ];
             payloadPrompt = JSON.stringify(rendererPayload);
        } else {
             payloadPrompt = finalPromptText;
        }
      }

      const selectedProvider = keys.find(k => k.id === selectedKey)?.provider;
      const payload = {
        api_key_id: selectedKey,
        provider: selectedProvider,
        model: selectedModel,
        type: mode,
        prompt: payloadPrompt,
        params: params
      };

      // 🌟 强制使用底层 request，加上斜杠防重定向
      const res = await apiClient.request({ url: '/generate/', method: 'POST', data: payload });
      message.success('生成成功！');

      updateNodeData(id, { ...data, result: res.data });

      const connectedEdges = edges.filter(e => e.source === id);
      if (connectedEdges.length > 0) {
        setNodes((nds) => nds.map((node) => {
            if (connectedEdges.find(e => e.target === node.id)) {
              return { ...node, data: { ...node.data, incoming_data: res.data } };
            }
            return node;
        }));
      }
    } catch (error: any) {
      message.error(`生成报错: ${error.response?.data?.detail || '未知错误'}`);
    } finally {
      setGenerating(false);
    }
  };

  // 🌟 动态渲染参数表单面板
  const renderParams = () => {
    const m = allModels.find(i => i.model_name === selectedModel);
    if (!m?.context_ui_params || !m.context_ui_params[mode]) return null;

    return m.context_ui_params[mode].map((p: any) => (
      <div key={p.name} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <Text type="secondary">{p.label}</Text>
          {p.type === 'number' && <Text type="secondary">{params[p.name] ?? p.default}</Text>}
        </div>
        {p.type === 'select' && (
          <Select
            className="nodrag" size="small" style={{ width: '100%' }}
            value={params[p.name] ?? p.default}
            onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))}
            options={p.options}
          />
        )}
        {p.type === 'number' && p.max <= 2 && (
          <Slider
            className="nodrag" min={p.min} max={p.max} step={p.step}
            value={params[p.name] ?? p.default}
            onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))}
            style={{ margin: '0 8px' }}
          />
        )}
        {p.type === 'number' && p.max > 2 && (
          <InputNumber
            className="nodrag" size="small" style={{ width: '100%' }}
            value={params[p.name] ?? p.default}
            onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))}
          />
        )}
      </div>
    ));
  };

  const renderDynamicHandles = () => {
    const handles = [];
    if (isAgentMode) {
        handles.push(
          <Tooltip key="sys-in" title="外挂预设 (System Prompt)" placement="left">
            <Handle type="target" position={Position.Left} id="system" style={{ top: 20, background: '#fadb14', width: 10, height: 10, border: '2px solid #fff' }} />
          </Tooltip>
        );
    }
    handles.push(
      <Tooltip key="text-in" title="输入素材/上下文" placement="left">
        <Handle type="target" position={Position.Left} id="text" style={{ top: 50, background: '#52c41a', width: 10, height: 10 }} />
      </Tooltip>
    );
    if (mode === 'vision' || mode === 'image' || mode === 'video') {
      handles.push(
        <Tooltip key="img-in" title="输入参考图片" placement="left">
          <Handle type="target" position={Position.Left} id="image" style={{ top: 80, background: '#1890ff', width: 10, height: 10 }} />
        </Tooltip>
      );
    }
    return handles;
  };

  return (
    <BaseNode {...props}>
      {renderDynamicHandles()}

      <div style={{ width: 250 }}>
        {isAgentMode && (
          <div style={{ marginBottom: 8, background: isRoleCollapsed ? '#fafafa' : '#fff7e6', borderRadius: 6, border: '1px solid #f0f0f0', transition: 'all 0.3s' }}>
            <div onClick={() => setIsRoleCollapsed(!isRoleCollapsed)} style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <Text strong style={{ color: isRoleCollapsed ? '#595959' : '#d46b08' }}>🎭 设定: {SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES]?.label.split(' ')[1]}</Text>
               {isRoleCollapsed ? <DownOutlined style={{ fontSize: 10, color: '#bfbfbf' }}/> : <UpOutlined style={{ fontSize: 10, color: '#d46b08' }}/>}
            </div>
            {!isRoleCollapsed && (
               <div style={{ padding: '0 8px 8px 8px' }}>
                  <Select className="nodrag" size="small" style={{ width: '100%', marginBottom: 4 }} value={selectedRole} onChange={v => { setSelectedRole(v); updateNodeData(id, { selectedRole: v }); }} options={Object.entries(SYSTEM_ROLES).map(([k, v]) => ({ label: v.label, value: k }))} />
                  <div style={{ background: '#fff', padding: '4px 6px', borderRadius: 4, border: '1px dashed #ffd591' }}><Text type="secondary" style={{ fontSize: 10, lineHeight: '1.4', display: 'block' }}>{SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES]?.prompt}</Text></div>
               </div>
            )}
          </div>
        )}

        <Segmented
          block size="small" value={mode}
          onChange={v => { setMode(v as string); setSelectedModel(''); setParams({}); }}
          options={[
            { value: 'chat', icon: <MessageOutlined />, label: '文本' },
            { value: 'vision', icon: <EyeOutlined />, label: '识图' },
            { value: 'image', icon: <PictureOutlined />, label: '绘图' },
            { value: 'video', icon: <VideoCameraOutlined />, label: '视频' },
          ]}
          style={{ marginBottom: 8 }}
        />

        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          <Select className="nodrag" placeholder="1. 选择云端算力/Key" size="small" style={{ width: '100%' }} value={selectedKey || undefined} onChange={handleKeyChange} options={keys.map(k => ({ label: `${k.provider} - ${k.description || '默认'}`, value: k.id }))} />
          {loading ? <div style={{ textAlign: 'center', margin: '10px 0' }}><Spin size="small" /></div> : (
            <>
              <Select className="nodrag" placeholder="2. 选择 AI 模型" size="small" style={{ width: '100%' }} value={selectedModel || undefined} onChange={handleModelChange} disabled={!selectedKey} options={allModels.map(m => { let labelText = m.display_name; if (m.health_status === 'quota_exhausted') labelText = `🔴 ${m.display_name} (空)`; else if (m.health_status === 'unauthorized') labelText = `🟠 ${m.display_name} (无权)`; else if (m.health_status === 'error') labelText = `⚫ ${m.display_name} (错)`; return { label: labelText, value: m.model_name }; })} />

              {/* 🌟 完美的动态参数面板挂载点 */}
              <div style={{ background: params && Object.keys(params).length > 0 ? '#fafafa' : 'transparent', padding: params && Object.keys(params).length > 0 ? '8px 8px 0 8px' : 0, borderRadius: 6, border: params && Object.keys(params).length > 0 ? '1px solid #f0f0f0' : 'none' }}>
                {renderParams()}
              </div>

              <TextArea className="nodrag" placeholder={isAgentMode ? "干预指令 (选填)..." : "描述你要生成的画面..."} size="small" rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} />
              <Button type="primary" size="small" block style={{ marginTop: 4 }} loading={generating} onClick={handleRun}>{generating ? '处理中...' : (isAgentMode ? '大脑运转' : '开始渲染')}</Button>
            </>
          )}
        </Space>
      </div>
      <Tooltip title="输出生成结果" placement="right">
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} id="out" style={{ background: '#fa8c16', width: 10, height: 10 }} />
      </Tooltip>
    </BaseNode>
  );
};

if (!nodeRegistry.get('generate')) {
  nodeRegistry.register({ type: 'generate', displayName: '🧠 AI 节点', component: GenerateNode, defaultData: { label: '🧠 AI 节点' } });
}

export default GenerateNode;