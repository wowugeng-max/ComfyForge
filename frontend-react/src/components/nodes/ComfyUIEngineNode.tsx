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
  const { getEdges, getNodes } = useReactFlow();

  const [providers, setProviders] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(data.selectedProvider || null);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(data.selectedKeyId || null);

  const [workflowJson, setWorkflowJson] = useState<string>(data.workflowJson || '');
  const [parameters, setParameters] = useState<any>(data.parameters || null);
  const [paramValues, setParamValues] = useState<Record<string, any>>(data.paramValues || {});

  const [isRunning, setIsRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');

  const [savingAsset, setSavingAsset] = useState(false);
  const [showPreview, setShowPreview] = useState<boolean>(data.showPreview ?? true);

  // 🌟 核心破案点：绝对硬编码直连后端的 8000 端口，彻底绕过前端代理黑洞！
  useEffect(() => {
    const wsURL = `ws://127.0.0.1:8000/api/ws/${id}`;
    console.log(`📡 [WS] 正在尝试连接大动脉: ${wsURL}`);

    const ws = new WebSocket(wsURL);

    ws.onopen = () => {
      console.log(`🟢 [WS] 大动脉连接成功！画布节点通道 ID: ${id}`);
    };

    ws.onmessage = (event) => {
      console.log(`📩 [WS] 接收到心跳包:`, event.data);
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'status') {
          setProgressMsg(payload.message);
        } else if (payload.type === 'result') {
          message.success('物理节点渲染成功！');
          updateNodeData(id, { result: payload.data });
          setIsRunning(false);
          setProgressMsg('');
        } else if (payload.type === 'error') {
          message.error(payload.message);
          setIsRunning(false);
          setProgressMsg('');
        }
      } catch (e) {
        console.error("❌ [WS] 心跳包解析失败", e);
      }
    };

    ws.onerror = (error) => {
      console.error(`❌ [WS] 大动脉连接断裂！请检查后端 8000 端口是否存活。`, error);
    };

    ws.onclose = (e) => {
      console.log(`🔴 [WS] 大动脉已关闭 (状态码: ${e.code})`);
    };

    return () => {
      ws.close();
    };
  }, [id, updateNodeData]);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: any) => {
      const asset = item.asset;
      if (asset && (asset.type === 'workflow' || asset.type === 'prompt')) {
        try {
          const rawContent = asset.data?.content || asset.content || asset.data || {};
          let parsedData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
          let finalWorkflowObj = parsedData.workflow_json || parsedData;
          let finalParams = parsedData.parameters || null;

          const jsonString = JSON.stringify(finalWorkflowObj, null, 2);
          setWorkflowJson(jsonString);
          setParameters(finalParams);
          setParamValues({});

          updateNodeData(id, { label: `🚀 ${asset.name}`, workflowJson: jsonString, parameters: finalParams, paramValues: {} });
          message.success(`载入工作流: ${asset.name}`);
        } catch (err) {}
      }
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }));

  useEffect(() => {
    providerApi.getAll('comfyui').then(r => setProviders(r.data)).catch(()=>{});
    keyApi.getAll().then(r => setKeys(r.data)).catch(()=>{});
  }, []);

  const availableKeys = keys.filter(k => String(k.provider).toLowerCase() === String(selectedProvider).toLowerCase() && k.is_active);

  const handleRun = async () => {
    if (!selectedProvider || !selectedKeyId) return message.warning('请选择执行凭证');
    if (!workflowJson.trim()) return message.warning('请拖入工作流或输入JSON');

    // 🌟 清空历史产物，并开启 loading
    updateNodeData(id, { result: null });
    setIsRunning(true);
    setProgressMsg('正在唤醒本地引擎...');

    try {
      let finalWorkflow = JSON.parse(workflowJson);
      const edges = getEdges();
      const nodes = getNodes();
      const incomingEdges = edges.filter(e => e.target === id);

      if (parameters) {
        Object.keys(parameters).forEach(paramName => {
          const config = parameters[paramName];
          let valToInject = paramValues[paramName];
          const connectedEdge = incomingEdges.find(e => e.targetHandle === `param-${paramName}`);
          if (connectedEdge) {
            const sourceNode = nodes.find(n => n.id === connectedEdge.source);
            if (sourceNode) valToInject = sourceNode.data.result?.content || sourceNode.data.asset?.data?.content || sourceNode.data.incoming_data?.content;
          }
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

      await apiClient.post('/generate', {
        api_key_id: selectedKeyId,
        provider: selectedProvider,
        model: 'comfyui-workflow',
        type: 'image',
        prompt: JSON.stringify(finalWorkflow),
        params: { client_id: id }
      });

    } catch (error: any) {
      message.error(error.response?.data?.detail || '投递失败');
      setIsRunning(false);
      setProgressMsg('');
    }
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      const isVideo = data.result.type === 'video' || contentStr.match(/\.(mp4|webm|mov|gif)(\?|$)/i);

      await apiClient.post('/assets/', {
        name: `${isVideo ? '🎬' : '🖼️'} 物理机渲染产物...`,
        type: isVideo ? 'video' : 'image',
        data: { file_path: contentStr, url: contentStr, content: contentStr },
        tags: ['ComfyUI_Rendered'],
        thumbnail: isVideo ? undefined : contentStr,
        project_id: projectId ? Number(projectId) : null
      });
      message.success(`已固化到当前项目！`);
    } catch (error: any) {
      message.error(`入库失败`);
    } finally {
      setSavingAsset(false);
    }
  };

  const renderParameterHandles = () => {
    if (!parameters) return null;
    return Object.keys(parameters).map((paramName, index) => (
      <Tooltip key={paramName} title={`接收: ${paramName}`} placement="left">
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
            {isRunning ? '任务执行中...' : '提交给引擎'}
          </Button>

          <div className="nodrag" style={{ marginTop: 2, background: '#f8fafc', padding: 6, borderRadius: 6, border: '1px dashed #cbd5e1', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPreview ? 4 : 0 }}>
              <Text style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>&gt; GPU_OUTPUT</Text>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {data.result?.content && (
                  <Tooltip title="固化到资产库">
                    <Button type="text" size="small" icon={<SaveOutlined />} loading={savingAsset} onClick={handleSaveToAsset} style={{ fontSize: 14, color: '#0ea5e9', padding: 0, height: 'auto' }} />
                  </Tooltip>
                )}
                <Switch size="small" checked={showPreview} onChange={(v) => { setShowPreview(v); updateNodeData(id, { showPreview: v }); }} />
              </div>
            </div>
            {showPreview && (
              <div style={{ minHeight: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#e2e8f0', borderRadius: 4, marginTop: 4, overflow: 'hidden', padding: isRunning ? 12 : 0 }}>
                {isRunning ? (
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
                    <div style={{ padding: 8, maxHeight: 80, overflowY: 'auto', fontSize: 11, color: '#475569', whiteSpace: 'pre-wrap', width: '100%', wordBreak: 'break-all' }}>{data.result.content}</div>
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