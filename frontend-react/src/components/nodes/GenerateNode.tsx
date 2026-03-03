import React, { useState, useEffect } from 'react';
import { type NodeProps, useReactFlow } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Input, Button, message, Spin, InputNumber } from 'antd';
import apiClient from '../../api/client';

const { TextArea } = Input;

// 模型参数定义
const modelParamDefs: Record<string, any[]> = {
  'qwen-turbo': [
    { name: 'seed', label: '种子', type: 'number', default: 42 },
    { name: 'temperature', label: '温度', type: 'number', default: 0.7 },
  ],
  'dall-e-3': [
    { name: 'size', label: '尺寸', type: 'string', default: '1024x1024' },
  ],
};

// 供应商数据
const providers = [
  { value: 'Qwen', label: 'Qwen', models: ['qwen-turbo', 'qwen-plus'] },
  { value: 'OpenAI', label: 'OpenAI', models: ['dall-e-3', 'gpt-4o'] },
];

const GenerateNode: React.FC<NodeProps> = (props) => {
  const { id, data } = props;
  const [genType, setGenType] = useState(data.genType || 'image');
  const [provider, setProvider] = useState(data.provider || '');
  const [model, setModel] = useState(data.model || '');
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const { setNodes } = useReactFlow();

  // 这里的配置是为了让 Select 下拉框在 ReactFlow 这种有缩放和 overflow:hidden 的容器里正常显示
  const selectProps = {
    style: { width: '100%', marginBottom: 8 },
    // 关键点 1：将下拉层渲染到 body，防止被节点容器截断
    getPopupContainer: () => document.body,
  };

  useEffect(() => {
    if (!model) return;
    const defs = modelParamDefs[model] || [];
    const initial: Record<string, any> = {};
    defs.forEach(p => { initial[p.name] = p.default; });
    setParamValues(initial);
  }, [model]);

  const handleGenerate = async () => {
    if (!provider || !model || !prompt) {
      message.warning('请填写完整信息');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('/generate', {
        provider,
        model,
        type: genType,
        prompt,
        params: paramValues,
      });
      const resultData = response.data;
      setResult(resultData);
      message.success('生成成功');

      const newData = {
        ...data,
        provider,
        model,
        genType,
        prompt,
        result: resultData
      };
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return { ...node, data: newData };
          }
          return node;
        })
      );
    } catch (error) {
      message.error('生成失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderPreview = () => {
    if (!result) return null;
    if (result.type === 'image' && result.content) {
      return <img src={`data:image/png;base64,${result.content}`} alt="生成图像" style={{ maxWidth: '100%', maxHeight: 150 }} />;
    }
    if (result.type === 'video' && result.content) {
      return <video src={`/api/files/${result.content}`} controls style={{ maxWidth: '100%', maxHeight: 150 }} />;
    }
    return <div>生成结果: {result.content}</div>;
  };

  return (
    <BaseNode {...props}>
      {/* 关键点 2：阻止 PointerDown 冒泡，防止点击下拉框时触发 ReactFlow 的节点拖拽 */}
      <div style={{ padding: 8 }} onPointerDown={(e) => e.stopPropagation()}>
        <Select
          {...selectProps}
          placeholder="生成类型"
          value={genType}
          onChange={setGenType}
          options={[
            { value: 'image', label: '图像' },
            { value: 'video', label: '视频' },
            { value: 'prompt', label: '提示词' },
          ]}
        />

        <Select
          {...selectProps}
          placeholder="供应商"
          value={provider}
          onChange={(val) => {
            setProvider(val);
            setModel(''); // 切换供应商时清空已选模型
          }}
          options={providers.map(p => ({ value: p.value, label: p.label }))}
        />

        <Select
          {...selectProps}
          placeholder="模型"
          value={model || undefined} // 使用 undefined 才会显示 placeholder
          onChange={setModel}
          options={provider ? providers.find(p => p.value === provider)?.models.map(m => ({ value: m, label: m })) : []}
        />

        <TextArea
          placeholder="提示词"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          style={{ marginBottom: 8 }}
        />

        {model && modelParamDefs[model]?.map(p => (
          <div key={p.name} style={{ marginBottom: 8 }}>
            <span style={{ marginRight: 8 }}>{p.label}:</span>
            {p.type === 'number' ? (
              <InputNumber
                value={paramValues[p.name]}
                onChange={val => setParamValues({...paramValues, [p.name]: val})}
                style={{ width: '100%' }}
              />
            ) : (
              <Input
                value={paramValues[p.name]}
                onChange={e => setParamValues({...paramValues, [p.name]: e.target.value})}
              />
            )}
          </div>
        ))}

        <Button type="primary" onClick={handleGenerate} loading={loading} block>
          生成
        </Button>

        {loading && <Spin style={{ marginTop: 8 }} />}
        {renderPreview()}
      </div>
    </BaseNode>
  );
};

if (!nodeRegistry.get('generate')) {
  nodeRegistry.register({
    type: 'generate',
    displayName: 'Generate',
    component: GenerateNode,
    defaultData: {
      label: 'Generate',
      genType: 'image',
    },
    inputs: {},
    outputs: {},
  });
}

export default GenerateNode;