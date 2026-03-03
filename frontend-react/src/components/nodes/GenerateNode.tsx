import React, { useState, useEffect, useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber, Typography, Segmented } from 'antd';
import { MessageOutlined, PictureOutlined, VideoCameraOutlined, EyeOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useCanvasStore } from '../../stores/canvasStore';

const { TextArea } = Input;
const { Text } = Typography;

const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data } = props;
  const { updateNodeData } = useCanvasStore();

  const [loading, setLoading] = useState(false);
  const [allModels, setAllModels] = useState<any[]>([]);
  const [mode, setMode] = useState<string>(data.mode || 'image');
  const [selectedModel, setSelectedModel] = useState<string>(data.model_name || '');
  const [prompt, setPrompt] = useState<string>(data.prompt || '');
  const [params, setParams] = useState<Record<string, any>>(data.params || {});
  const [generating, setGenerating] = useState(false);

  // 1. 根据模式动态加载模型列表
  useEffect(() => {
    const fetchModels = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/models/?mode=${mode}`);
        setAllModels(res.data);
      } catch (err) { message.error('获取模型失败'); }
      finally { setLoading(false); }
    };
    fetchModels();
  }, [mode]);

  // 2. 状态同步至全局 Store
  useEffect(() => {
    updateNodeData(id, { mode, model_name: selectedModel, prompt, params });
  }, [mode, selectedModel, prompt, params]);

  const handleModelChange = (val: string) => {
    setSelectedModel(val);
    const m = allModels.find(i => i.model_name === val);
    if (m?.context_ui_params[mode]) {
      const defaults: any = {};
      m.context_ui_params[mode].forEach((p: any) => defaults[p.name] = p.default);
      setParams(defaults);
    }
  };

  const renderParams = () => {
    const m = allModels.find(i => i.model_name === selectedModel);
    if (!m?.context_ui_params[mode]) return null;
    return m.context_ui_params[mode].map((p: any) => (
      <div key={p.name} style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{p.label}</Text>
        <InputNumber className="nodrag" size="small" style={{ width: '100%' }}
          value={params[p.name]} onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))} />
      </div>
    ));
  };

  return (
    <BaseNode {...props}>
      <div style={{ width: 200 }}>
        <Segmented block size="small" value={mode} onChange={v => { setMode(v as string); setSelectedModel(''); }}
          options={[
            { value: 'chat', icon: <MessageOutlined />, label: '文本' },
            { value: 'vision', icon: <EyeOutlined />, label: '识图' },
            { value: 'image', icon: <PictureOutlined />, label: '绘图' },
          ]}
        />
        {loading ? <Spin size="small" /> : (
          <>
            <Select className="nodrag" placeholder="选择模型" size="small" style={{ width: '100%', margin: '8px 0' }}
              value={selectedModel || undefined} onChange={handleModelChange}
              options={allModels.map(m => ({ label: m.display_name, value: m.model_name }))}
            />
            <TextArea className="nodrag" placeholder="Prompt..." size="small" rows={3}
              value={prompt} onChange={e => setPrompt(e.target.value)} />
            {renderParams()}
            <Button type="primary" size="small" block style={{ marginTop: 8 }} loading={generating}>运行</Button>
          </>
        )}
      </div>
    </BaseNode>
  );
};

if (!nodeRegistry.get('generate')) {
  nodeRegistry.register({ type: 'generate', displayName: 'AI 生成器', component: GenerateNode });
}

export default GenerateNode;