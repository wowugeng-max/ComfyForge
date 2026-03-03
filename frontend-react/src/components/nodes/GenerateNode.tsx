import React, { useState, useEffect } from 'react';
import { type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Segmented, Space, Slider } from 'antd';
import { MessageOutlined, PictureOutlined, EyeOutlined,VideoCameraOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

const { TextArea } = Input;
const { Text } = Typography;

const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data } = props;
  const { updateNodeData } = useCanvasStore();

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

  // 1. 初始化拉取所有启用的 API Keys
  useEffect(() => {
    apiClient.get('/keys/').then(res => {
      // 过滤出启用状态的 Key
      setKeys(res.data.filter((k: any) => k.is_active));
    }).catch(() => message.error('获取 API Key 失败'));
  }, []);

  // 2. 级联逻辑：当选中的 Key 或 Mode 变化时，拉取专属模型列表
  useEffect(() => {
    if (!selectedKey) {
      setAllModels([]);
      return;
    }
    const fetchModels = async () => {
      setLoading(true);
      try {
        // 请求后端: 根据 Key ID 和能力模式筛选模型
        const res = await apiClient.get(`/models/?key_id=${selectedKey}&mode=${mode}`);
        setAllModels(res.data);

        // 如果之前选中的模型不在新列表里，清空选择
        if (!res.data.find((m: any) => m.model_name === selectedModel)) {
          setSelectedModel('');
          setParams({});
        }
      } catch (err) {
        message.error('获取模型失败');
      } finally {
        setLoading(false);
      }
    };
    fetchModels();
  }, [selectedKey, mode]); // 依赖项：Key ID 和 模式

  // 3. 状态同步至全局 Store
  useEffect(() => {
    updateNodeData(id, {
      api_key_id: selectedKey,
      mode,
      model_name: selectedModel,
      prompt,
      params
    });
  }, [selectedKey, mode, selectedModel, prompt, params, id, updateNodeData]);

  const handleKeyChange = (val: number) => {
    setSelectedKey(val);
    setSelectedModel(''); // 切换 Key 后强制重新选模型
    setParams({});
  };

  const handleModelChange = (val: string) => {
    setSelectedModel(val);
    const m = allModels.find(i => i.model_name === val);
    if (m?.context_ui_params[mode]) {
      const defaults: any = {};
      m.context_ui_params[mode].forEach((p: any) => defaults[p.name] = p.default);
      setParams(defaults);
    }
  };

  // 动态渲染参数组件
  const renderParams = () => {
    const m = allModels.find(i => i.model_name === selectedModel);
    if (!m?.context_ui_params || !m.context_ui_params[mode]) return null;

    return m.context_ui_params[mode].map((p: any) => (
      <div key={p.name} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <Text type="secondary">{p.label}</Text>
          <Text type="secondary">{params[p.name] ?? p.default}</Text>
        </div>
        {/* 根据参数类型渲染不同的控件，这里以 Slider 和 InputNumber 结合为例 */}
        {p.type === 'number' && p.max <= 2 ? (
          <Slider
            className="nodrag"
            min={p.min} max={p.max} step={p.step}
            value={params[p.name] ?? p.default}
            onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))}
            style={{ margin: '0 8px' }}
          />
        ) : (
          <InputNumber
            className="nodrag" size="small" style={{ width: '100%' }}
            value={params[p.name] ?? p.default}
            onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))}
          />
        )}
      </div>
    ));
  };

  return (
    <BaseNode {...props}>
      <div style={{ width: 220 }}>
        {/* 模式切换 */}
        <Segmented
          block size="small" value={mode}
          onChange={v => { setMode(v as string); setSelectedModel(''); setParams({}); }}
          options={[
            { value: 'chat', icon: <MessageOutlined />, label: '文本' },
            { value: 'vision', icon: <EyeOutlined />, label: '识图' },
            { value: 'image', icon: <PictureOutlined />, label: '绘图' },
            { value: 'video', icon: <VideoCameraOutlined />, label: '视频' }, // <-- 加上这一行
          ]}
          style={{ marginBottom: 8 }}
        />

        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {/* 第一级：选择 API Key */}
          <Select
            className="nodrag" placeholder="1. 选择 API Key" size="small" style={{ width: '100%' }}
            value={selectedKey || undefined} onChange={handleKeyChange}
            options={keys.map(k => ({ label: `${k.provider} - ${k.description || '默认'}`, value: k.id }))}
          />

          {loading ? <div style={{ textAlign: 'center', margin: '10px 0' }}><Spin size="small" /></div> : (
            <>
              {/* 第二级：选择模型 */}
              <Select
                className="nodrag" placeholder="2. 选择模型" size="small" style={{ width: '100%' }}
                value={selectedModel || undefined} onChange={handleModelChange}
                disabled={!selectedKey}
                options={allModels.map(m => ({ label: m.display_name, value: m.model_name }))}
              />

              {/* 输入框 */}
              <TextArea
                className="nodrag" placeholder="输入 Prompt..." size="small" rows={3}
                value={prompt} onChange={e => setPrompt(e.target.value)}
                style={{ marginTop: 4 }}
              />

              {/* 第三级：动态渲染参数 */}
              <div style={{ marginTop: 8 }}>
                {renderParams()}
              </div>

              {/* 执行按钮 */}
              <Button type="primary" size="small" block style={{ marginTop: 8 }} loading={generating}>
                运行节点
              </Button>
            </>
          )}
        </Space>
      </div>
    </BaseNode>
  );
};

if (!nodeRegistry.get('generate')) {
  nodeRegistry.register({ type: 'generate', displayName: 'AI 生成器', component: GenerateNode });
}

export default GenerateNode;