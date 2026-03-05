import React, { useState, useEffect } from 'react';
import { type NodeProps, useReactFlow, Handle, Position } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Segmented, Space, Slider, Tooltip, Collapse } from 'antd';
import { MessageOutlined, PictureOutlined, EyeOutlined, VideoCameraOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

const { TextArea } = Input;
const { Text } = Typography;

// 🌟 核心：预设金牌角色 (System Prompts)
const SYSTEM_ROLES = {
  'free_agent': {
    label: '🧠 自由智能体 (默认)',
    prompt: '你是一个万能 AI 助手，严格遵循用户指令，保持专业、创意、精确。用户会给出具体角色和要求，你按要求执行。'
  },
  'storyboard': {
    label: '🎬 分镜大师',
    prompt: '你是好莱坞顶级分镜导演，精通 9 宫格分镜法。严格按照用户提供的故事/剧本，输出 9 张分镜描述，每张包含：镜头类型、构图、情绪、光影、动作、时长建议。用极简英文 Tag 格式，便于直接转 ComfyUI。'
  },
  'fashion': {
    label: '👗 服装设计大师',
    prompt: '你是顶级时尚设计师 + 服装概念艺术家。用户给你角色/场景描述后，输出一套完整服装设计：材质、颜色、细节、搭配建议，并生成 5 个英文 Prompt（正面+负面），直接可用于 Flux/SD3 生成。'
  },
  'script': {
    label: '📝 剧本/故事扩写大师',
    prompt: '你是好莱坞金牌编剧。用户给一段剧情，你必须扩写成完整场景描述（包含人物动作、对话、环境、情绪转折），字数精确控制在用户要求内，语言极具画面感。'
  },
  'prompt_engineer': {
    label: '🔄 提示词反推/优化大师',
    prompt: '你是顶级 Prompt Engineer。用户给图片/视频/文字，你反推或优化成极致详细的英文 Prompt（包含权重、风格、质量词），并同时给出负面 Prompt。'
  },
  'translator': {
    label: '🌍 中英双语翻译官',
    prompt: '你是专业本地化翻译 + Prompt 优化师。把中文指令翻译成最适合 AI 生成的自然英文，并自动添加行业最佳实践词（cinematic, highly detailed 等）。'
  }
};

const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data, isConnectable } = props;
  const { updateNodeData } = useCanvasStore();
  const { getEdges, getNodes, setNodes } = useReactFlow();

  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<any[]>([]);
  const [allModels, setAllModels] = useState<any[]>([]);

  // --- 节点内部状态 ---
  const [selectedKey, setSelectedKey] = useState<number | null>(data.api_key_id || null);
  const [mode, setMode] = useState<string>(data.mode || 'chat');
  const [selectedModel, setSelectedModel] = useState<string>(data.model_name || '');
  const [prompt, setPrompt] = useState<string>(data.prompt || '');
  const [params, setParams] = useState<Record<string, any>>(data.params || {});
  const [generating, setGenerating] = useState(false);

  // 🌟 新增：角色与折叠状态
  const [selectedRole, setSelectedRole] = useState<string>(data.selectedRole || 'free_agent');
  const [isRoleCollapsed, setIsRoleCollapsed] = useState<boolean>(true);

  // 初始化拉取 API Keys
  useEffect(() => {
    apiClient.get('/keys/').then(res => {
      setKeys(res.data.filter((k: any) => k.is_active));
    }).catch(() => message.error('获取 API Key 失败'));
  }, []);

  // 拉取专属模型列表
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
      } catch (err) { message.error('获取模型失败'); }
      finally { setLoading(false); }
    };
    fetchModels();
  }, [selectedKey, mode]);

  // 状态同步
  useEffect(() => {
    updateNodeData(id, { api_key_id: selectedKey, mode, model_name: selectedModel, prompt, params, selectedRole });
  }, [selectedKey, mode, selectedModel, prompt, params, selectedRole, id, updateNodeData]);

  const handleKeyChange = (val: number) => { setSelectedKey(val); setSelectedModel(''); setParams({}); };
  const handleModelChange = (val: string) => {
    setSelectedModel(val);
    const m = allModels.find(i => i.model_name === val);
    if (m?.context_ui_params[mode]) {
      const defaults: any = {};
      m.context_ui_params[mode].forEach((p: any) => defaults[p.name] = p.default);
      setParams(defaults);
    }
  };

  // 🌟 Agent 核心大脑运转逻辑
  const handleRun = async () => {
    if (!selectedKey || !selectedModel) return message.warning('请完整选择 Key 和 模型');
    setGenerating(true);

    try {
      const edges = getEdges();
      const nodes = getNodes();
      const incomingEdges = edges.filter(e => e.target === id);

      let finalPromptText = prompt;
      let incomingImages: string[] = [];
      let externalSystemPrompt = ''; // 用于接收左侧外部覆盖的灵魂

      incomingEdges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          const sourceContent = sourceNode.data.asset?.data?.content || sourceNode.data.asset?.data?.file_path || sourceNode.data.result?.content;

          if (edge.targetHandle === 'text' && sourceContent) {
             finalPromptText = finalPromptText ? `${finalPromptText}\n\n[前置参考素材]:\n${sourceContent}` : sourceContent;
          } else if (edge.targetHandle === 'image' && sourceContent) {
             const imgData = sourceContent.startsWith('http') || sourceContent.startsWith('data:') ? sourceContent : `http://localhost:8000/${sourceContent}`;
             incomingImages.push(imgData);
          } else if (edge.targetHandle === 'system' && sourceContent) {
             externalSystemPrompt = sourceContent; // 🌟 截获外挂的 System Prompt
          }
        }
      });

      if (!finalPromptText && incomingImages.length === 0 && !externalSystemPrompt) {
        return message.warning('请输入指令或连接素材节点');
      }

      // 🌟 组装终极 Agent 消息数组格式
      const activeSystemPrompt = externalSystemPrompt || SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].prompt;

      let messagesPayload: any[] = [
         { role: "system", content: activeSystemPrompt }
      ];

      // 处理多模态用户输入
      if ((mode === 'vision' || mode === 'image') && incomingImages.length > 0) {
         messagesPayload.push({
            role: "user",
            content: [
               { type: 'text', text: finalPromptText || "请处理这张图片" },
               ...incomingImages.map(img => ({ type: 'image', data: img }))
            ]
         });
      } else {
         messagesPayload.push({
            role: "user",
            content: finalPromptText || "开始执行"
         });
      }

      const selectedProvider = keys.find(k => k.id === selectedKey)?.provider;
      const payload = {
        api_key_id: selectedKey,
        provider: selectedProvider,
        model: selectedModel,
        type: mode,
        prompt: JSON.stringify(messagesPayload), // 转成 JSON 字符串，后端的兼容层会完美解析它
        params: params
      };

      const res = await apiClient.post('/generate/', payload);
      message.success('生成成功！');

      updateNodeData(id, { ...data, result: res.data });

      // 主动推送给下游
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

  const renderDynamicHandles = () => {
    const handles = [];

    // 🌟 外挂灵魂端口（黄色）
    handles.push(
      <Tooltip key="sys-in" title="外挂预设 (System Prompt)" placement="left">
        <Handle type="target" position={Position.Left} id="system" style={{ top: 20, background: '#fadb14', width: 10, height: 10, border: '2px solid #fff' }} />
      </Tooltip>
    );

    handles.push(
      <Tooltip key="text-in" title="输入素材/上下文" placement="left">
        <Handle type="target" position={Position.Left} id="text" style={{ top: 50, background: '#52c41a', width: 10, height: 10 }} />
      </Tooltip>
    );

    if (mode === 'vision') {
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
        {/* 🌟 新增：极简可折叠角色面板 */}
        <div style={{ marginBottom: 8, background: isRoleCollapsed ? '#fafafa' : '#fff7e6', borderRadius: 6, border: '1px solid #f0f0f0', transition: 'all 0.3s' }}>
          <div
             onClick={() => setIsRoleCollapsed(!isRoleCollapsed)}
             style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
             <Text strong style={{ color: isRoleCollapsed ? '#595959' : '#d46b08' }}>
               🎭 设定: {SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].label.split(' ')[1]}
             </Text>
             {isRoleCollapsed ? <DownOutlined style={{ fontSize: 10, color: '#bfbfbf' }}/> : <UpOutlined style={{ fontSize: 10, color: '#d46b08' }}/>}
          </div>

          {!isRoleCollapsed && (
             <div style={{ padding: '0 8px 8px 8px' }}>
                <Select
                  className="nodrag" size="small" style={{ width: '100%', marginBottom: 4 }}
                  value={selectedRole}
                  onChange={v => { setSelectedRole(v); updateNodeData(id, { selectedRole: v }); }}
                  options={Object.entries(SYSTEM_ROLES).map(([k, v]) => ({ label: v.label, value: k }))}
                />
                <div style={{ background: '#fff', padding: '4px 6px', borderRadius: 4, border: '1px dashed #ffd591' }}>
                  <Text type="secondary" style={{ fontSize: 10, lineHeight: '1.4', display: 'block' }}>
                    {SYSTEM_ROLES[selectedRole as keyof typeof SYSTEM_ROLES].prompt}
                  </Text>
                </div>
             </div>
          )}
        </div>

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
          <Select
            className="nodrag" placeholder="1. 选择云端算力/Key" size="small" style={{ width: '100%' }}
            value={selectedKey || undefined} onChange={handleKeyChange}
            options={keys.map(k => ({ label: `${k.provider} - ${k.description || '默认'}`, value: k.id }))}
          />

          {loading ? <div style={{ textAlign: 'center', margin: '10px 0' }}><Spin size="small" /></div> : (
            <>
              <Select
                className="nodrag" placeholder="2. 选择 AI 模型" size="small" style={{ width: '100%' }}
                value={selectedModel || undefined} onChange={handleModelChange} disabled={!selectedKey}
                options={allModels.map(m => {
                  let labelText = m.display_name;
                  if (m.health_status === 'quota_exhausted') labelText = `🔴 ${m.display_name} (空)`;
                  else if (m.health_status === 'unauthorized') labelText = `🟠 ${m.display_name} (无权)`;
                  else if (m.health_status === 'error') labelText = `⚫ ${m.display_name} (错)`;
                  return { label: labelText, value: m.model_name };
                })}
              />

              <TextArea
                className="nodrag" placeholder="干预指令 (选填)..." size="small" rows={2}
                value={prompt} onChange={e => setPrompt(e.target.value)}
              />

              <Button type="primary" size="small" block style={{ marginTop: 4 }} loading={generating} onClick={handleRun}>
                {generating ? '大脑运转中...' : '开始生成'}
              </Button>
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
  nodeRegistry.register({ type: 'generate', displayName: '🧠 AI 大脑', component: GenerateNode, defaultData: { label: '🧠 AI 大脑' } });
}

export default GenerateNode;