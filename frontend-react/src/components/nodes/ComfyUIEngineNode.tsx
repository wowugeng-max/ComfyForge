// frontend-react/src/components/nodes/ComfyUIEngineNode.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { useParams } from 'react-router-dom';
import { Select, Input, Button, message, Typography, Tooltip, Spin, Switch, Divider } from 'antd';
import { PlayCircleOutlined, ApiOutlined, SaveOutlined, StopOutlined, SettingOutlined, CloseOutlined } from '@ant-design/icons';
import { providerApi } from '../../api/providers';
import { keyApi } from '../../api/keys';
import apiClient from '../../api/client';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { inferParamType, getTypeColor, getTypeLabel } from '../../utils/handleTypes';
import { AspectRatioTrigger, AspectRatioPanel, type AspectRatioValue } from '../AspectRatioSelector';
import { CameraTrigger, CameraPanel, buildCameraPromptSuffix, type CustomCameraOptions } from '../CameraControl';
import { CameraMovementTrigger, CameraMovementPanel, type CameraMovementPreset } from '../CameraMovement';
import { useDrop } from 'react-dnd';
import { DndItemTypes } from '../../constants/dnd';
import { BaseNode } from './BaseNode';
import { useCanvasStore } from '../../stores/canvasStore';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';

const { Text } = Typography;
const { TextArea } = Input;

export default function ComfyUIEngineNode(props: NodeProps) {
  const { data, id } = props;
  const { id: projectId } = useParams<{ id: string }>();

  const updateNodeData = useCanvasStore(state => state.updateNodeData);
  const fetchAssets = useAssetLibraryStore(state => state.fetchAssets);
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

  // 弹出配置面板
  const [configOpen, setConfigOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'ratio' | 'camera' | 'movement' | null>(null);
  const [aspectRatioValue, setAspectRatioValue] = useState<AspectRatioValue>(data.aspectRatioValue || { aspectRatio: '', customWidth: 1920, customHeight: 1080 });
  const [cameraParams, setCameraParamsLocal] = useState<Record<string, string>>(data.cameraParams || {});
  const [customCameraOptions, setCustomCameraOptions] = useState<CustomCameraOptions>(data.customCameraOptions || {});
  const [customMovements, setCustomMovements] = useState<CameraMovementPreset[]>(data.customMovements || []);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const updatePanelPos = useCallback(() => {
    const nodeEl = nodeRef.current?.closest('.react-flow__node') as HTMLElement | null;
    if (!nodeEl) return;
    const rect = nodeEl.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 6, left: rect.left });
  }, []);

  useEffect(() => {
    if (!configOpen) return;
    updatePanelPos();
    const viewport = document.querySelector('.react-flow__viewport');
    const observer = new MutationObserver(updatePanelPos);
    if (viewport) observer.observe(viewport, { attributes: true, attributeFilter: ['transform', 'style'] });

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-config-panel]') && !target.closest('.react-flow__node')) {
        setConfigOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      observer.disconnect();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [configOpen, updatePanelPos]);

  const prevSignalRef = useRef(data._runSignal);
  useEffect(() => {
    if (data._runSignal && data._runSignal !== prevSignalRef.current) {
      prevSignalRef.current = data._runSignal;
      handleRun();
    }
  }, [data._runSignal]);

  useEffect(() => { setMediaDims(''); }, [data.result?.content]);

  // 血缘上下文 ref，供 WebSocket 闭包读取
  const lineageRef = useRef<Record<string, any>>({});
  useEffect(() => {
    const providerName = providers.find(p => p.id === selectedProvider)?.display_name || selectedProvider || '';
    lineageRef.current = {
      source_provider: providerName,
      source_model: 'ComfyUI Workflow',
      source_mode: 'comfyui',
      source_workflow: data._finalUsedWorkflow,
      source_params: data._finalUsedParams,
    };
  }, [providers, selectedProvider, data._finalUsedWorkflow, data._finalUsedParams]);

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
          const resultWithLineage = typeof payload.data === 'object'
            ? { ...payload.data, ...lineageRef.current }
            : { content: payload.data, ...lineageRef.current };
          updateNodeData(id, { result: resultWithLineage });
          setIsRunning(false);
          setProgressMsg('');
          setNodeStatus(id, 'success');

          const currentEdges = getEdges();
          currentEdges.filter(e => e.source === id).forEach(edge => {
            updateNodeData(edge.target, { incoming_data: resultWithLineage });
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
    providerApi.getAll('comfyui').then(r => {
      setProviders(r.data);
      // 如果当前选中的 provider 不在过滤后的列表里，清掉
      if (selectedProvider && !r.data.find((p: any) => p.id === selectedProvider)) {
        setSelectedProvider(null);
        setSelectedKeyId(null);
        updateNodeData(id, { selectedProvider: null, selectedKeyId: null });
      }
    }).catch(()=>{});
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
            if (sourceNode) {
              const sd = sourceNode.data;
              const pType = inferParamType(paramName);
              if (pType === 'image') {
                // 图片类型：优先取 file_path / thumbnail / content
                valToInject = sd.result?.file_path || sd.result?.content
                  || sd.asset?.data?.file_path || sd.asset?.thumbnail
                  || sd.incoming_data?.file_path || sd.incoming_data?.content;
              } else {
                valToInject = sd.result?.content || sd.asset?.data?.content || sd.incoming_data?.content;
              }
            }
          }
          if (valToInject !== undefined && valToInject !== '' && config.node_id && config.field) {
            // 文本类型参数：自动拼接摄像机参数后缀
            const pType = inferParamType(paramName);
            if (pType === 'text') {
              const cameraSuffix = buildCameraPromptSuffix(cameraParams);
              if (cameraSuffix) valToInject = valToInject + cameraSuffix;
            }
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
      await apiClient.post(`/interrupt/${id}`);
      message.warning('已下发强制释放 GPU 信令，等待后端确认...');
    } catch (error) {
      message.error('中断信令发送失败 (可能引擎已空闲)');
    }
  };

  const handleSaveToAsset = async () => {
    if (!data.result?.content) return;
    setSavingAsset(true);
    try {
      const contentStr = String(data.result.content);
      const isVideo = data.result.type === 'video' || contentStr.match(/\.(mp4|webm|mov|gif)(\?|$)/i);
      const providerName = providers.find(p => p.id === selectedProvider)?.display_name || selectedProvider || '';

      await apiClient.post('/assets/', {
        name: `${isVideo ? '🎬' : '🖼️'} 物理机产物...`, type: isVideo ? 'video' : 'image',
        data: {
          file_path: contentStr, url: contentStr, content: contentStr,
          // 血缘追踪
          source_provider: providerName,
          source_model: 'ComfyUI Workflow',
          source_mode: 'comfyui',
          source_workflow: data._finalUsedWorkflow,
          source_params: data._finalUsedParams,
        },
        tags: ['ComfyUI_Rendered'], thumbnail: isVideo ? undefined : contentStr, project_id: projectId ? Number(projectId) : null
      });
      message.success(`已携带【工作流血统】固化到当前项目！`);
      if (projectId) fetchAssets(Number(projectId));
    } catch (error) { message.error(`入库失败`); } finally { setSavingAsset(false); }
  };

  const renderParameterHandles = () => {
    if (!parameters) return null;
    return Object.keys(parameters).map((paramName, index) => {
      const paramType = inferParamType(paramName);
      const color = getTypeColor(paramType);
      const label = getTypeLabel(paramType);
      return (
        <Tooltip key={paramName} title={`${label}输入: ${paramName}`} placement="left">
          <Handle type="target" position={Position.Left} id={`param-${paramName}`} style={{ top: 140 + (index * 48), background: color, width: 12, height: 12 }} />
        </Tooltip>
      );
    });
  };

  const selectedProviderName = providers.find(p => p.id === selectedProvider)?.display_name || selectedProvider || '未配置';

  const configPanel = configOpen && panelPos ? ReactDOM.createPortal(
    <div
      data-config-panel
      className="nodrag nowheel"
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        width: 320,
        maxHeight: '72vh',
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #e2e8f0',
        zIndex: 9999,
        padding: '10px 12px',
        fontSize: 12,
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', fontFamily: 'monospace', letterSpacing: 0.5 }}>
          <SettingOutlined style={{ marginRight: 5, color: '#fa8c16' }} />算力引擎 · 配置
        </Text>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setConfigOpen(false)} style={{ color: '#94a3b8' }} />
      </div>

      {/* Provider + Key 两列 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <div>
          <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>算力节点</Text>
          <Select
            size="small" style={{ width: '100%' }} placeholder="选择节点"
            options={providers.map(p => ({ label: p.display_name, value: p.id }))}
            value={selectedProvider}
            onChange={(val) => { setSelectedProvider(val); setSelectedKeyId(null); updateNodeData(id, { selectedProvider: val }); }}
          />
        </div>
        <div>
          <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>执行凭证</Text>
          <Select
            size="small" style={{ width: '100%' }} placeholder="选择 Key"
            options={availableKeys.map(k => ({ label: k.description || '凭证', value: k.id }))}
            value={selectedKeyId}
            onChange={(val) => { setSelectedKeyId(val); updateNodeData(id, { selectedKeyId: val }); }}
            disabled={!selectedProvider}
          />
        </div>
      </div>

      {/* 动态参数端口 */}
      {parameters && Object.keys(parameters).length > 0 && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ background: '#f8fafc', padding: '8px 8px 4px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 8 }}>
            <Text style={{ fontSize: 10, color: '#0ea5e9', fontWeight: 700, display: 'block', marginBottom: 6 }}>⚙️ 暴露参数</Text>
            {Object.keys(parameters).map((paramName) => {
              const pType = inferParamType(paramName);
              const color = getTypeColor(pType);
              const label = getTypeLabel(pType);
              let val = paramValues[paramName] || '';
              if (pType === 'image' && !val) {
                val = data.incoming_data?.file_path || data.incoming_data?.content || '';
              }
              return (
                <div key={paramName} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <Text style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>{paramName}</Text>
                    <Text style={{ fontSize: 9, color: '#94a3b8' }}>({label})</Text>
                  </div>
                  {pType === 'image' ? (
                    val ? (
                      <div style={{ position: 'relative', background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        <img src={val.startsWith('http') || val.startsWith('data:') ? val : `/api/assets/media/${val}`} alt={paramName} style={{ width: '100%', maxHeight: 120, objectFit: 'contain', display: 'block' }} />
                        <div style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3 }}>连线输入</div>
                      </div>
                    ) : (
                      <div style={{ background: '#f1f5f9', borderRadius: 6, border: '1px dashed #cbd5e1', padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>
                        等待连线输入图片...
                      </div>
                    )
                  ) : (
                    <Input.TextArea
                      className="nodrag nowheel" size="small"
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      value={val}
                      placeholder={pType === 'text' ? '输入提示词...' : '手动填写或连线覆盖...'}
                      style={{ fontSize: 12, borderRadius: 6 }}
                      onChange={(e) => { const newVals = { ...paramValues, [paramName]: e.target.value }; setParamValues(newVals); updateNodeData(id, { paramValues: newVals }); }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 工作流信息 */}
      {workflowJson && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            <ApiOutlined style={{ color: '#722ed1', fontSize: 13 }} />
            <Text style={{ fontSize: 12, color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.label?.replace(/^🚀\s*/, '') || '已载入工作流'}
            </Text>
            <Text type="secondary" style={{ fontSize: 10, flexShrink: 0 }}>
              {Object.keys(parameters || {}).length > 0 ? `${Object.keys(parameters).length} 个参数` : ''}
            </Text>
          </div>
        </>
      )}

      {/* 能力组件工具栏 */}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <AspectRatioTrigger value={aspectRatioValue} onClick={() => setActivePanel(activePanel === 'ratio' ? null : 'ratio')} />
        <CameraTrigger value={cameraParams} onClick={() => setActivePanel(activePanel === 'camera' ? null : 'camera')} />
        <CameraMovementTrigger onClick={() => setActivePanel(activePanel === 'movement' ? null : 'movement')} />
      </div>
      {activePanel === 'ratio' && (
        <AspectRatioPanel value={aspectRatioValue} onChange={(v) => { setAspectRatioValue(v); updateNodeData(id, { aspectRatioValue: v }); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'camera' && (
        <CameraPanel value={cameraParams} onChange={(v) => { setCameraParamsLocal(v); updateNodeData(id, { cameraParams: v }); }} onClose={() => setActivePanel(null)}
          customOptions={customCameraOptions}
          onCustomOptionsChange={(v) => { setCustomCameraOptions(v); updateNodeData(id, { customCameraOptions: v }); }}
        />
      )}
      {activePanel === 'movement' && (
        <CameraMovementPanel
          onInsert={(text) => {
            // 找到第一个 text 类型的参数，插入运镜 prompt
            const textParam = Object.keys(parameters || {}).find(k => inferParamType(k) === 'text');
            if (textParam) {
              const prev = paramValues[textParam] || '';
              const newVal = prev ? `${prev}, ${text}` : text;
              const newVals = { ...paramValues, [textParam]: newVal };
              setParamValues(newVals);
              updateNodeData(id, { paramValues: newVals });
            } else {
              message.info('已复制运镜提示词，请粘贴到需要的位置');
              navigator.clipboard.writeText(text);
            }
          }}
          onClose={() => setActivePanel(null)}
          customPresets={customMovements}
          onAddCustom={(preset) => { const updated = [...customMovements, preset]; setCustomMovements(updated); updateNodeData(id, { customMovements: updated }); }}
          onRemoveCustom={(value) => { const updated = customMovements.filter(m => m.value !== value); setCustomMovements(updated); updateNodeData(id, { customMovements: updated }); }}
        />
      )}
    </div>,
    document.body
  ) : null;

  return (
    <BaseNode {...props} onOpenConfig={() => { setConfigOpen(v => !v); }}>
      <Tooltip title="工作流输入 (拖入工作流资产)" placement="left">
        <Handle type="target" position={Position.Left} id="in" style={{ top: 50, background: '#722ed1', width: 12, height: 12 }} />
      </Tooltip>
      {renderParameterHandles()}
      {configPanel}

      <div ref={(el) => { (nodeRef as any).current = el; (drop as any)(el); }} style={{ width: '100%', height: '100%', border: isOver ? '2px dashed #1890ff' : '2px dashed transparent', backgroundColor: isOver ? 'rgba(24,144,255,0.05)' : 'transparent', transition: 'all 0.3s', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* 紧凑视图：Provider 名 + 工作流名称 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Text style={{ fontSize: 12, color: selectedProvider ? '#1e293b' : '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedProviderName}>
            🚀 {selectedProviderName}
          </Text>
        </div>

        {workflowJson ? (
          <div style={{ background: '#f3f0ff', borderRadius: 6, padding: '6px 10px', border: '1px solid #e2d6f8', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <ApiOutlined style={{ color: '#722ed1', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#5b21b6', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.label?.replace(/^🚀\s*/, '') || '工作流已载入'}
            </Text>
          </div>
        ) : (
          <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 8px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>
            拖入工作流资产或在配置面板输入 JSON...
          </div>
        )}

        <Button
          type="primary" danger={isRunning} block
          icon={isRunning ? <StopOutlined /> : <PlayCircleOutlined />}
          onClick={isRunning ? handleInterrupt : handleRun}
          style={{ flexShrink: 0, height: 36, fontSize: 13, fontWeight: 'bold' }}
        >
          {isRunning ? '终止任务' : '发送到物理机'}
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
            <div style={{ flex: 1, position: 'relative', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
              {mediaDims && !isRunning && data.result?.content && (
                <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#f8fafc', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, zIndex: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {mediaDims}
                </div>
              )}
              {isRunning ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
                  <Spin size="default" style={{ marginBottom: 12 }} />
                  <Text type="secondary" style={{ fontSize: 13, fontWeight: 'bold', color: '#10b981' }}>{progressMsg}</Text>
                </div>
              ) : data.result?.content ? (
                (typeof data.result.content === 'string' && (data.result.content.startsWith('http') || data.result.content.startsWith('data:'))) ? (
                  data.result.type === 'video' || data.result.content.match(/\.(mp4|webm|mov|gif)(\?|$)/i) ? (
                    <video src={data.result.content} controls autoPlay loop muted style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} onLoadedMetadata={(e) => setMediaDims(`${(e.target as HTMLVideoElement).videoWidth} × ${(e.target as HTMLVideoElement).videoHeight}`)} />
                  ) : (
                    <img src={data.result.content} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} alt="Preview" onLoad={(e) => setMediaDims(`${(e.target as HTMLImageElement).naturalWidth} × ${(e.target as HTMLImageElement).naturalHeight}`)} />
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
      <Tooltip title="通用输出" placement="right">
        <Handle type="source" position={Position.Right} id="out" style={{ background: '#fa8c16', width: 12, height: 12 }} />
      </Tooltip>
    </BaseNode>
  );
}

if (!nodeRegistry.get('comfyUIEngine')) {
  nodeRegistry.register({ type: 'comfyUIEngine', displayName: '🚀 算力引擎', component: ComfyUIEngineNode, defaultData: { label: '🚀 算力引擎', workflowJson: '' } });
}