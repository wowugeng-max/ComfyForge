// frontend-react/src/components/nodes/LoadAssetNode.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow';
import { useDrop } from 'react-dnd';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { DndItemTypes } from '../../constants/dnd';
import { useCanvasStore } from '../../stores/canvasStore';
import { Typography, Empty, Tooltip, Input, Button, message } from 'antd';
import { FileImageOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useParams } from 'react-router-dom';

const { Text } = Typography;
const { TextArea } = Input;

const LoadAssetNode: React.FC<NodeProps> = (props) => {
  const { id, data, isConnectable } = props;
  const { updateNodeData } = useCanvasStore();
  const setNodeStatus = useCanvasStore(state => state.setNodeStatus);
  const { getEdges } = useReactFlow();
  const { id: projectId } = useParams<{ id: string }>();

  const [asset, setAsset] = useState<any>(data.asset || null);
  const [content, setContent] = useState<string>(data.asset?.data?.content || data.asset?.data?.file_path || '');
  const [isSaving, setIsSaving] = useState(false);
  const [mediaDims, setMediaDims] = useState<string>('');

  // 🌟 DAG 感知：响应 _runSignal
  const prevSignalRef = useRef(data._runSignal);
  useEffect(() => {
    if (data._runSignal && data._runSignal !== prevSignalRef.current) {
      prevSignalRef.current = data._runSignal;
      const assetData = data.asset?.data;
      if (assetData) {
        setNodeStatus(id, 'success');
        // 向下游推送资产数据
        getEdges().filter(e => e.source === id).forEach(edge => {
          updateNodeData(edge.target, { incoming_data: assetData });
        });
      } else {
        // 没有加载资产，标记失败
        setNodeStatus(id, 'error');
      }
    }
  }, [data._runSignal]);

  useEffect(() => {
    if (data.asset) {
      setAsset(data.asset);
      setContent(data.asset.data?.content || data.asset.data?.file_path || '');
      setMediaDims('');
    }
  }, [data.asset]);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: { asset: any }) => { handleAssetDrop(item.asset); },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  }));

  const handleAssetDrop = (droppedAsset: any) => {
    setAsset(droppedAsset);
    setContent(droppedAsset.data?.content || droppedAsset.data?.file_path || '');
    const outputType = droppedAsset.type === 'prompt' ? 'text' : droppedAsset.type;
    updateNodeData(id, { asset: droppedAsset, outputs: { output: { type: outputType, label: droppedAsset.name } }, label: `${droppedAsset.name}` });
    message.success(`成功载入资产`);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    if (data.asset) updateNodeData(id, { asset: { ...data.asset, data: { ...data.asset.data, content: newContent } } });
  };

  const handleSaveAsNewAsset = async () => {
    if (!content.trim()) return message.warning('内容为空');
    setIsSaving(true);
    try {
      await apiClient.post('/assets/', {
        name: `${asset?.name || '新资产'} (修改版)`, type: asset?.type || 'prompt',
        data: { content: content, file_path: asset?.type !== 'prompt' ? content : undefined },
        tags: ['Modified_Asset'], project_id: projectId ? Number(projectId) : null
      });
      message.success('已固化为新资产！');
    } catch (error) { message.error('保存失败'); } finally { setIsSaving(false); }
  };

  const renderPreview = () => {
    if (!asset) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="拖拽资产到此" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;

    const isMedia = asset.type === 'image' || asset.type === 'video';
    const previewUrl = asset.thumbnail || (asset.data?.file_path ? (asset.data.file_path.startsWith('http') ? asset.data.file_path : `/api/assets/media/${asset.data.file_path}`) : null);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <Text strong style={{ fontSize: 13, color: '#475569' }}>
            {isMedia ? <><FileImageOutlined /> 媒体预览</> : <><EditOutlined /> 内容编辑</>}
          </Text>
          {!isMedia && (
            <Tooltip title="将修改后的内容另存为新资产">
              <Button type="primary" size="small" icon={<SaveOutlined />} loading={isSaving} onClick={handleSaveAsNewAsset}>固化</Button>
            </Tooltip>
          )}
        </div>

        {/* 🌟 核心修改：移除容器的 nodrag，只给文字输入框保留 nodrag + nowheel */}
        <div style={{ flex: 1, position: 'relative', background: isMedia ? '#f1f5f9' : '#ffffff', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', minHeight: 80, display: isMedia ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center' }}>
          {isMedia && mediaDims && (
            <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#f8fafc', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, zIndex: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
              {mediaDims}
            </div>
          )}

          {isMedia ? (
            asset.type === 'video' || (previewUrl && previewUrl.match(/\.(mp4|webm|mov)(\?|$)/i)) ? (
              <video src={previewUrl} controls loop muted style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} onLoadedMetadata={(e) => setMediaDims(`${(e.target as HTMLVideoElement).videoWidth} × ${(e.target as HTMLVideoElement).videoHeight}`)} />
            ) : (
              <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} onLoad={(e) => setMediaDims(`${(e.target as HTMLImageElement).naturalWidth} × ${(e.target as HTMLImageElement).naturalHeight}`)} />
            )
          ) : (
            <TextArea
              className="nodrag nowheel" // 🌟 仅在输入框上防拖拽防滚轮缩放
              value={content}
              onChange={handleContentChange}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', resize: 'none', fontSize: 13, color: '#1e293b', fontFamily: 'monospace', borderRadius: 8, border: 'none', padding: 8 }}
            />
          )}
        </div>
      </div>
    );
  };

  const renderHandles = () => {
    if (!asset) return null;
    const outputType = asset.type === 'prompt' ? 'text' : asset.type;
    let handleColor = '#d9d9d9';
    if (outputType === 'text') handleColor = '#52c41a';
    else if (outputType === 'image') handleColor = '#1890ff';
    else if (outputType === 'video') handleColor = '#eb2f96';
    else if (outputType === 'workflow') handleColor = '#722ed1';

    return (
      <Tooltip title={`输出 ${outputType}`} placement="right">
         <Handle type="source" position={Position.Right} id="output" isConnectable={isConnectable} style={{ background: handleColor, width: 12, height: 12, border: '2px solid #fff' }} />
      </Tooltip>
    );
  };

  return (
    <BaseNode {...props} data={{...data, label: data._customLabel ? data.label : (asset ? `📦 ${asset.name}` : '加载资产')}}>
      {renderHandles()}
      <div ref={drop} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: isOver ? 'rgba(24, 144, 255, 0.05)' : 'transparent', transition: 'all 0.3s' }}>
        {renderPreview()}
      </div>
    </BaseNode>
  );
}

if (!nodeRegistry.get('loadAsset')) {
  nodeRegistry.register({ type: 'loadAsset', displayName: '📦 资产输入', component: LoadAssetNode, defaultData: { label: '资产输入', asset: null } });
}

export default LoadAssetNode;