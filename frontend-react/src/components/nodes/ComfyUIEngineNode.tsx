// frontend-react/src/components/nodes/ComfyUIEngineNode.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { useParams } from 'react-router-dom';
import { Select, Input, Button, message, Typography, Tooltip, Space, Spin, Switch } from 'antd';
import { PlayCircleOutlined, ApiOutlined, SaveOutlined,StopOutlined } from '@ant-design/icons';
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

  const updateNodeData = useCanvasStore(state => state.updateNodeData);
  const setNodeStatus = useCanvasStore(state => state.setNodeStatus);
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
  const [mediaDims, setMediaDims] = useState<string>('');

  const prevSignalRef = useRef(data._runSignal);
  useEffect(() => {
    if (data._runSignal && data._runSignal !== prevSignalRef.current) {
      prevSignalRef.current = data._runSignal;
      handleRun();
    }
  }, [data._runSignal]);

  useEffect(() => { setMediaDims(''); }, [data.result?.content]);

  useEffect(() => {
    const httpBase = apiClient.defaults.baseURL || 'http://127.0.0.1:8000/api';
    let wsBase = httpBase.startsWith('http')
      ? httpBase.replace(/^http/, 'ws')
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${httpBase}`;

    const wsURL = `${wsBase.replace(/\/$/, '')}/ws/${id}`;
    const ws = new WebSocket(wsURL);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'status') {
          setProgressMsg(payload.message);
        } else if (payload.type === 'result') {
          message.success('物理节点渲染成功！');
          updateNodeData(id, { result: payload.data });
          setIsRunning(false);
          setProgressMsg('');
          setNodeStatus(id, 'success');

          const currentEdges = getEdges();
          currentEdges.filter(e => e.source === id).forEach(edge => {
            updateNodeData(edge.target, { incoming_data: payload.data });
          });

        } else if (payload.type === 'error') {
          message.error(payload.message);
          setIsRunning(false);
          setProgressMsg('');
          setNodeStatus(id, 'error');
        }
      } catch (e) {}
    };
    return () => ws.close();
  }, [id, updateNodeData, setNodeStatus, getEdges]);

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
    if (!selectedProvider || !selectedKeyId) { setNodeStatus(id, 'error'); return message.warning('请选择执行凭证'); }
    if (!workflowJson.trim()) { setNodeStatus(id, 'error'); return message.warning('请拖入工作流或输入JSON'); }

    // 🌟 运行前，必须彻底清空旧状态
    updateNodeData(id, { result: null });
    setNodeStatus(id, 'running');
    setIsRunning(true); setProgressMsg('正在唤醒本地引擎...'); setNodeStatus(id, 'running');

    try {
      let finalWorkflow = JSON.parse(workflowJson);
      const edges = getEdges(); const nodes = getNodes(); const incomingEdges = edges.filter(e => e.target === id);

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
                if (!current[pathParts[i]]) current[pathParts[i]] = {}; current = current[pathParts[i]];
              }
              current[pathParts[pathParts.length - 1]] = valToInject;
            }
          }
        });
      }

      updateNodeData(id, { _finalUsedWorkflow: finalWorkflow, _finalUsedParams: paramValues });

      await apiClient.post('/generate', {
        api_key_id: selectedKeyId, provider: selectedProvider, model: 'comfyui-workflow', type: 'image',
        prompt: JSON.stringify(finalWorkflow), params: { client_id: id }
      });
    } catch (error: any) {
      message.error(error.response?.data?.detail || '投递失败');
      setIsRunning(false); setProgressMsg(''); setNodeStatus(id, 'error');
    }
  };

  // 🌟 Phase 10: 物理级中断机制
  // 🌟 物理级中断机制：信任后端，死等报错包！
  const handleInterrupt = async () => {
    try {
      await apiClient.post(`/api/interrupt/${id}`); // 确保有 /api 前缀
      message.warning('已下发强制释放 GPU 信令，等待后端确认...');
    } catch (error) {
      message.error('中断信令发送失败 (可能引擎已空闲)');
    }
    // ⚠️ 删掉整个 finally 块！不要在这里调用 setIsRunning(false) 和 setNodeStatus(id, 'idle')！
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      const isVideo = data.result.type === 'video' || contentStr.match(/\.(mp4|webm|mov|gif)(\?|$)/i);

      await apiClient.post('/assets/', {
        name: `${isVideo ? '🎬' : '🖼️'} 物理机产物...`, type: isVideo ? 'video' : 'image',
        data: { file_path: contentStr, url: contentStr, content: contentStr, source_workflow: data._finalUsedWorkflow, source_params: data._finalUsedParams },
        tags: ['ComfyUI_Rendered'], thumbnail: isVideo ? undefined : contentStr, project_id: projectId ? Number(projectId) : null
      });
      message.success(`已携带【工作流血统】固化到当前项目！`);
    } catch (error) { message.error(`入库失败`); } finally { setSavingAsset(false); }
  };

  const renderParameterHandles = () => {
    if (!parameters) return null;
    return Object.keys(parameters).map((paramName, index) => (
      <Tooltip key={paramName} title={`接收: ${paramName}`} placement="left">
        <Handle type="target" position={Position.Left} id={`param-${paramName}`} style={{ top: 140 + (index * 48), background: '#10b981', width: 12, height: 12 }} />
      </Tooltip>
    ));
  };

  return (
    <BaseNode {...props}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 50, width: 12, height: 12 }} />
      {renderParameterHandles()}

      <div ref={drop} style={{ width: '100%', height: '100%', padding: '0 0 12px 0', border: isOver ? '2px dashed #1890ff' : '2px dashed transparent', backgroundColor: isOver ? 'rgba(24,144,255,0.05)' : 'transparent', transition: 'all 0.3s', display: 'flex', flexDirection: 'column' }}>

        {/* 🌟 核心：移除父容器 nodrag，让空白处成为可拖拽体 */}
        <div className="nowheel" style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', minHeight: 120 }}>

          <Space direction="vertical" size="small" style={{ width: '100%', flexShrink: 0 }}>
            {/* 给输入控件精准附加 nodrag */}
            <Select className="nodrag" size="middle" style={{ width: '100%' }} placeholder="1. 算力节点" options={providers.map(p => ({ label: p.display_name, value: p.id }))} value={selectedProvider} onChange={(val) => { setSelectedProvider(val); setSelectedKeyId(null); updateNodeData(id, { selectedProvider: val }); }} />
            <Select className="nodrag" size="middle" style={{ width: '100%' }} placeholder="2. 执行凭证" options={availableKeys.map(k => ({ label: k.description || '凭证', value: k.id }))} value={selectedKeyId} onChange={(val) => { setSelectedKeyId(val); updateNodeData(id, { selectedKeyId: val }); }} disabled={!selectedProvider} />
          </Space>

          {parameters && Object.keys(parameters).length > 0 && (
            <div style={{ background: '#f8fafc', padding: '12px 12px 4px 12px', borderRadius: 8, border: '1px solid #cbd5e1', flexShrink: 0 }}>
              <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block', color: '#0ea5e9' }}>⚙️ 动态参数端口</Text>
              {Object.keys(parameters).map((paramName) => (
                <div key={paramName} style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4, color: '#475569', fontWeight: 500 }}>{paramName}</Text>
                  <Input className="nodrag" size="middle" value={paramValues[paramName] || ''} placeholder="手动填写或连线覆盖..." onChange={(e) => { const newVals = { ...paramValues, [paramName]: e.target.value }; setParamValues(newVals); updateNodeData(id, { paramValues: newVals }); }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ flexShrink: 0 }}>
            <Text type="secondary" style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}><ApiOutlined /> JSON 源码</Text>
            <TextArea className="nodrag nowheel" rows={2} style={{ fontSize: 12, fontFamily: 'monospace', borderRadius: 8, marginTop: 4 }} value={workflowJson} onChange={(e) => { setWorkflowJson(e.target.value); updateNodeData(id, { workflowJson: e.target.value }); }} />
          </div>
        </div>

{/* 🌟 Phase 10 核心：移除 loading 属性，变成危险红色的紧急刹车按钮 */}
        <Button
          type="primary"
          danger={isRunning}
          block
          icon={isRunning ? <StopOutlined /> : <PlayCircleOutlined />}
          onClick={isRunning ? handleInterrupt : handleRun}
          style={{ flexShrink: 0, margin: '12px 0', height: 40, fontSize: 15, fontWeight: 'bold' }}
        >
          {isRunning ? '终止任务 (强行释放 GPU)' : '发送到物理机'}
        </Button>

        {/* 🌟 同样移除下半区大容器的 nodrag */}
        <div style={{ flex: showPreview ? '1 1 50%' : '0 0 auto', display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px dashed #94a3b8', minHeight: showPreview ? 140 : 'auto', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <Text style={{ fontSize: 13, color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>&gt; GPU_OUTPUT</Text>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {data.result?.content && (
                <Tooltip title="携带血统固化到资产库">
                  <Button type="text" size="small" icon={<SaveOutlined />} loading={savingAsset} onClick={handleSaveToAsset} style={{ fontSize: 18, color: '#0ea5e9', padding: 0, height: 'auto' }} />
                </Tooltip>
              )}
              <Switch className="nodrag" size="small" checked={showPreview} onChange={(v) => { setShowPreview(v); updateNodeData(id, { showPreview: v }); }} />
            </div>
          </div>

          {showPreview && (
            <div style={{ flex: 1, position: 'relative', background: '#0f172a', borderRadius: 8, overflow: 'hidden', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {mediaDims && !isRunning && data.result?.content && (
                <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#f8fafc', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, zIndex: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {mediaDims}
                </div>
              )}
              {isRunning ? (
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
                  // 🌟 文字显示区域保留 nodrag nowheel 防止复制和滚动冲突
                  <div className="nodrag nowheel" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', padding: 12, overflowY: 'auto', fontSize: 13, color: '#f8fafc', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{data.result.content}</div>
                )
              ) : (
                <Text type="secondary" style={{ fontSize: 13, color: '#475569' }}>等待物理机回传...</Text>
              )}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#fa8c16', width: 12, height: 12 }} />
    </BaseNode>
  );
}

if (!nodeRegistry.get('comfyUIEngine')) {
  nodeRegistry.register({ type: 'comfyUIEngine', displayName: '🚀 算力引擎', component: ComfyUIEngineNode, defaultData: { label: '🚀 算力引擎', workflowJson: '' } });
}