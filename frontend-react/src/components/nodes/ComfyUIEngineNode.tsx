// frontend-react/src/components/nodes/ComfyUIEngineNode.tsx
import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { useParams } from 'react-router-dom';
import { Select, Input, Button, message, Typography, Tooltip, Space, Spin, Switch } from 'antd';
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
  const { id: projectId } = useParams<{ id: string }>();
  const { updateNodeData } = useCanvasStore();
  const { getEdges, getNodes } = useReactFlow(); // 🌟 用于溯源连线！

  const [providers, setProviders] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(data.selectedProvider || null);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(data.selectedKeyId || null);

  const [workflowJson, setWorkflowJson] = useState<string>(data.workflowJson || '');
  const [parameters, setParameters] = useState<any>(data.parameters || null);
  const [paramValues, setParamValues] = useState<Record<string, any>>(data.paramValues || {});

  const [isRunning, setIsRunning] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [showPreview, setShowPreview] = useState<boolean>(data.showPreview ?? true);

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

          updateNodeData(id, {
            label: `🚀 ${asset.name}`,
            workflowJson: jsonString,
            parameters: finalParams,
            paramValues: {}
          });
          message.success(`成功载入工作流: ${asset.name}`);
        } catch (err) {
          message.error('工作流数据解析失败');
        }
      } else {
        message.warning('只能拖入“工作流”资产');
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
    if (!selectedProvider || !selectedKeyId) return message.warning('请选择执行凭证');
    if (!workflowJson.trim()) return message.warning('请拖入工作流或输入JSON');

    setIsRunning(true);

    try {
      let finalWorkflow = JSON.parse(workflowJson);

      // 🌟 连线数据穿透：沿着边找源头数据！
      const edges = getEdges();
      const nodes = getNodes();
      const incomingEdges = edges.filter(e => e.target === id);

      if (parameters) {
        Object.keys(parameters).forEach(paramName => {
          const config = parameters[paramName];
          let valToInject = paramValues[paramName]; // 默认取用户手填的值

          // 逆向追溯有没有连线接在这个参数上
          const connectedEdge = incomingEdges.find(e => e.targetHandle === `param-${paramName}`);
          if (connectedEdge) {
            const sourceNode = nodes.find(n => n.id === connectedEdge.source);
            if (sourceNode) {
              valToInject = sourceNode.data.result?.content || sourceNode.data.asset?.data?.content || sourceNode.data.incoming_data?.content;
            }
          }

          // 深度注入 JSON
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

      // 🌟 核心：去掉了 /generate 后面的斜杠，避免 307 重定向
      const res = await apiClient.post('/generate', {
        api_key_id: selectedKeyId,
        provider: selectedProvider,
        model: 'comfyui-workflow',
        type: 'image',
        prompt: JSON.stringify(finalWorkflow)
      });

      message.success('物理节点渲染成功！');
      updateNodeData(id, { ...data, result: res.data });
    } catch (error: any) {
      message.error(error.response?.data?.detail || '执行失败');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      await apiClient.post('/assets/', {
        name: `🖼️ 物理机渲染图...`,
        type: 'image',
        data: { file_path: contentStr, url: contentStr, content: contentStr },
        tags: ['ComfyUI_Rendered', selectedProvider || ''],
        thumbnail: contentStr,
        project_id: projectId ? Number(projectId) : null
      });
      message.success('成图已固化到当前项目！');
    } catch (error: any) {
      message.error(`入库失败: ${error.response?.data?.detail}`);
    } finally {
      setSavingAsset(false);
    }
  };

  const renderParameterHandles = () => {
    if (!parameters) return null;
    return Object.keys(parameters).map((paramName, index) => (
      <Tooltip key={paramName} title={`接收传入数据: ${paramName}`} placement="left">
        <Handle type="target" position={Position.Left} id={`param-${paramName}`} style={{ top: 120 + (index * 42), background: '#10b981', width: 10, height: 10 }} />
      </Tooltip>
    ));
  };

  return (
    <BaseNode {...props}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 40 }} />
      {renderParameterHandles()}

      <div ref={drop} style={{ width: '100%', height: '100%', padding: 8, border: isOver ? '2px dashed #1890ff' : '1px dashed transparent', backgroundColor: isOver ? '#f0f7ff' : 'transparent', transition: 'all 0.3s', borderRadius: 6, display: 'flex', flexDirection: 'column' }}>
        <div className="nodrag" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: 4 }}>

          <Space direction="vertical" size="small" style={{ width: '100%', flexShrink: 0 }}>
            <Select size="small" style={{ width: '100%' }} placeholder="1. 算力节点" options={providers.map(p => ({ label: p.display_name, value: p.id }))} value={selectedProvider} onChange={(val) => { setSelectedProvider(val); setSelectedKeyId(null); updateNodeData(id, { selectedProvider: val }); }} />
            <Select size="small" style={{ width: '100%' }} placeholder="2. 执行凭证" options={availableKeys.map(k => ({ label: k.description || '凭证', value: k.id }))} value={selectedKeyId} onChange={(val) => { setSelectedKeyId(val); updateNodeData(id, { selectedKeyId: val }); }} disabled={!selectedProvider} />
          </Space>

          {parameters && Object.keys(parameters).length > 0 && (
            <div style={{ background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid #e8e8e8', flexShrink: 0 }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block', color: '#1890ff' }}>⚙️ 暴露的参数端口</Text>
              {Object.keys(parameters).map((paramName) => (
                <div key={paramName} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{paramName}</Text>
                  <Input size="small" value={paramValues[paramName] || ''} placeholder="手动填写或连线覆盖..." onChange={(e) => { const newVals = { ...paramValues, [paramName]: e.target.value }; setParamValues(newVals); updateNodeData(id, { paramValues: newVals }); }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ flexShrink: 0 }}>
            <Text type="secondary" style={{ fontSize: 11 }}><ApiOutlined /> JSON 源码</Text>
            <TextArea rows={2} style={{ fontSize: 10, fontFamily: 'monospace' }} value={workflowJson} onChange={(e) => { setWorkflowJson(e.target.value); updateNodeData(id, { workflowJson: e.target.value }); }} />
          </div>

          <Button type="primary" block icon={<PlayCircleOutlined />} loading={isRunning} onClick={handleRun} style={{ flexShrink: 0, height: 32, fontWeight: 'bold' }}>
            {isRunning ? 'GPU 渲染中...' : '提交给引擎'}
          </Button>

          {/* 🌟 复用 AI 大脑节点的预览与保存窗 */}
          <div className="nodrag" style={{ marginTop: 2, background: '#f8fafc', padding: 6, borderRadius: 6, border: '1px dashed #cbd5e1', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPreview ? 4 : 0 }}>
              <Text style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>&gt; GPU_OUTPUT</Text>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {data.result?.content && (
                  <Tooltip title="固化渲染图到资产库">
                    <Button type="text" size="small" icon={<SaveOutlined />} loading={savingAsset} onClick={handleSaveToAsset} style={{ fontSize: 14, color: '#0ea5e9', padding: 0, height: 'auto' }} />
                  </Tooltip>
                )}
                <Switch size="small" checked={showPreview} onChange={(v) => { setShowPreview(v); updateNodeData(id, { showPreview: v }); }} />
              </div>
            </div>
            {showPreview && (
              <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}>
                {isRunning ? (
                  <Spin size="small" style={{ margin: '8px 0' }} />
                ) : data.result?.content ? (
                  (typeof data.result.content === 'string' && (data.result.content.startsWith('http') || data.result.content.startsWith('data:image'))) ? (
                    <img src={data.result.content} style={{ width: '100%', objectFit: 'contain' }} alt="Generated Preview" />
                  ) : (
                    <div style={{ padding: 8, maxHeight: 80, overflowY: 'auto', fontSize: 11, color: '#475569', whiteSpace: 'pre-wrap', width: '100%', wordBreak: 'break-all' }}>
                      {data.result.content}
                    </div>
                  )
                ) : (
                  <Text type="secondary" style={{ fontSize: 10, padding: '8px 0' }}>[ 等待物理机回传... ]</Text>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#fa8c16' }} />
    </BaseNode>
  );
}

if (!nodeRegistry.get('comfyUIEngine')) {
  nodeRegistry.register({ type: 'comfyUIEngine', displayName: '🚀 算力引擎', component: ComfyUIEngineNode, defaultData: { label: '🚀 算力引擎', workflowJson: '' } });
}