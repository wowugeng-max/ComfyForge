// frontend-react/src/components/nodes/ComfyUIEngineNode.tsx
import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { Select, Input, Button, message, Typography, Tooltip, Space } from 'antd';
import { PlayCircleOutlined, ApiOutlined, SaveOutlined } from '@ant-design/icons';
import { providerApi } from '../../api/providers';
import { keyApi } from '../../api/keys';
import apiClient from '../../api/client';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { useDrop } from 'react-dnd';
import { DndItemTypes } from '../../constants/dnd';
import { BaseNode } from './BaseNode';
import { useCanvasStore } from '../../stores/canvasStore';

const { Text } = Typography;
const { TextArea } = Input;

export default function ComfyUIEngineNode(props: NodeProps) {
  const { data, id } = props;
  const { updateNodeData } = useCanvasStore();
  const { getEdges, getNodes } = useReactFlow(); // 🌟 引入画布遍历钩子

  const [providers, setProviders] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(data.selectedProvider || null);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(data.selectedKeyId || null);

  const [workflowJson, setWorkflowJson] = useState<string>(data.workflowJson || '');
  const [parameters, setParameters] = useState<any>(data.parameters || null);
  const [paramValues, setParamValues] = useState<Record<string, any>>(data.paramValues || {});

  const [isRunning, setIsRunning] = useState(false);
  const [resultOutput, setResultOutput] = useState<any>(null);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: any) => {
      const asset = item.asset;
      if (asset && (asset.type === 'workflow' || asset.type === 'prompt')) {
        try {
          const rawContent = asset.data?.content || asset.content || asset.data || {};
          let parsedData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

          let finalWorkflowObj = parsedData;
          let finalParams = null;

          if (parsedData && parsedData.workflow_json) {
            finalWorkflowObj = parsedData.workflow_json;
            finalParams = parsedData.parameters || null;
          } else if (parsedData && parsedData.parameters) {
            finalParams = parsedData.parameters;
          }

          const jsonString = JSON.stringify(finalWorkflowObj, null, 2);
          setWorkflowJson(jsonString);
          setParameters(finalParams);
          setParamValues({});
          setResultOutput(null);

          updateNodeData(id, {
            label: `🚀 ${asset.name}`,
            workflowJson: jsonString,
            parameters: finalParams,
            paramValues: {}
          });
          message.success(`成功加载: ${asset.name}`);
        } catch (err) {
          message.error('工作流数据解析失败');
        }
      } else {
        message.warning('请拖入“工作流”资产');
      }
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }));

  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const [provRes, keyRes] = await Promise.all([providerApi.getAll('comfyui'), keyApi.getAll()]);
        setProviders(provRes.data);
        setKeys(keyRes.data);
      } catch (error) {}
    };
    fetchInitData();
  }, []);

  const availableKeys = keys.filter(k => k.provider.toLowerCase() === selectedProvider?.toLowerCase() && k.is_active);

  const handleRun = async () => {
    if (!selectedProvider || !selectedKeyId) return message.warning('请选择平台和凭证');
    if (!workflowJson.trim()) return message.warning('请输入工作流');

    setIsRunning(true);
    setResultOutput(null);

    try {
      let finalWorkflow = JSON.parse(workflowJson);

      // 🌟 核心突破：连线数据穿透！
      const edges = getEdges();
      const nodes = getNodes();
      const incomingEdges = edges.filter(e => e.target === id);

      if (parameters) {
        Object.keys(parameters).forEach(paramName => {
          const config = parameters[paramName];
          let valToInject = paramValues[paramName]; // 默认取手填的值

          // 🌟 逆向追溯：看看有没有连线接在这个参数上
          const connectedEdge = incomingEdges.find(e => e.targetHandle === `param-${paramName}`);
          if (connectedEdge) {
            const sourceNode = nodes.find(n => n.id === connectedEdge.source);
            if (sourceNode) {
              // 优先级：大脑的生成结果 > 资产节点内容 > 其它输入
              valToInject = sourceNode.data.result?.content || sourceNode.data.asset?.data?.content || sourceNode.data.incoming_data?.content;
            }
          }

          // 执行深度注入
          if (valToInject !== undefined && valToInject !== '' && config.node_id && config.field) {
            const pathParts = config.field.split('/');
            let current = finalWorkflow[config.node_id];
            if (current) {
              for (let i = 0; i < pathParts.length - 1; i++) {
                if (!current[pathParts[i]]) current[pathParts[i]] = {};
                current = current[pathParts[i]];
              }
              current[pathParts[pathParts.length - 1]] = valToInject;
            }
          }
        });
      }

      // 注意这里的请求将路由给我们在后端注册的 comfyui adapter
      const res = await apiClient.post('/generate/', {
        api_key_id: selectedKeyId,
        provider: selectedProvider,
        model: 'comfyui-workflow',
        type: 'image', // 临时，后续根据工作流自适应
        prompt: JSON.stringify(finalWorkflow),
        params: { provider: selectedProvider }
      });

      message.success('引擎提交成功！');
      setResultOutput(res.data.content);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '执行失败');
    } finally {
      setIsRunning(false);
    }
  };

  // 🌟 动态渲染接收端口 (Handles)
  const renderParameterHandles = () => {
    if (!parameters) return null;
    return Object.keys(parameters).map((paramName, index) => (
      <Tooltip key={paramName} title={`接收传入数据: ${paramName}`} placement="left">
        <Handle
          type="target"
          position={Position.Left}
          id={`param-${paramName}`}
          style={{ top: 120 + (index * 42), background: '#10b981', width: 10, height: 10 }}
        />
      </Tooltip>
    ));
  };

  return (
    <BaseNode {...props}>
      {/* 预留一个主控入口 */}
      <Handle type="target" position={Position.Left} id="in" style={{ top: 40 }} />
      {renderParameterHandles()}

      <div ref={drop} style={{ width: '100%', height: '100%', padding: 8, border: isOver ? '2px dashed #1890ff' : '1px dashed transparent', backgroundColor: isOver ? '#f0f7ff' : 'transparent', transition: 'all 0.3s', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div className="nodrag" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: 4 }}>

          <Space direction="vertical" size="small" style={{ width: '100%', flexShrink: 0 }}>
            <Select size="small" style={{ width: '100%' }} placeholder="1. 选择算力平台" options={providers.map(p => ({ label: p.display_name, value: p.id }))} value={selectedProvider} onChange={(val) => { setSelectedProvider(val); setSelectedKeyId(null); }} />
            <Select size="small" style={{ width: '100%' }} placeholder="2. 选择执行凭证" options={availableKeys.map(k => ({ label: k.description || '凭证', value: k.id }))} value={selectedKeyId} onChange={(val) => setSelectedKeyId(val)} disabled={!selectedProvider} />
          </Space>

          {parameters && Object.keys(parameters).length > 0 && (
            <div style={{ background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid #e8e8e8', flexShrink: 0 }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block', color: '#1890ff' }}>⚙️ 工作流暴露参数</Text>
              {Object.keys(parameters).map((paramName) => (
                <div key={paramName} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{paramName}</Text>
                  <Input size="small" value={paramValues[paramName] || ''} placeholder="手动填写或连线覆盖..." onChange={(e) => setParamValues({ ...paramValues, [paramName]: e.target.value })} />
                </div>
              ))}
            </div>
          )}

          <div style={{ flexShrink: 0 }}>
            <Text type="secondary" style={{ fontSize: 11 }}><ApiOutlined /> JSON 源码</Text>
            <TextArea rows={2} style={{ fontSize: 10, fontFamily: 'monospace' }} value={workflowJson} onChange={(e) => setWorkflowJson(e.target.value)} />
          </div>

          <Button type="primary" block icon={<PlayCircleOutlined />} loading={isRunning} onClick={handleRun} style={{ flexShrink: 0 }}>
            {isRunning ? '发往引擎...' : '执行工作流'}
          </Button>

          {resultOutput && (
            <div style={{ background: '#f6ffed', padding: 8, borderRadius: 6, border: '1px solid #b7eb8f', flexShrink: 0 }}>
              <Text strong style={{ fontSize: 12, color: '#389e0d' }}>✅ 渲染下发成功</Text>
              <pre style={{ fontSize: 10, margin: '8px 0', maxHeight: 80, overflowY: 'auto' }}>{JSON.stringify(resultOutput, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" style={{ background: '#fa8c16' }} />
    </BaseNode>
  );
}

if (!nodeRegistry.get('comfyUIEngine')) {
  nodeRegistry.register({ type: 'comfyUIEngine', displayName: '🚀 算力引擎', component: ComfyUIEngineNode, defaultData: { label: '🚀 算力引擎', workflowJson: '' } });
}