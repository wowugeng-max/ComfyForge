import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useDrop } from 'react-dnd';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { DndItemTypes } from '../../constants/dnd';
import { useCanvasStore } from '../../stores/canvasStore';
import { Typography, Empty, Tooltip } from 'antd';
// 🌟 1. 引入了一个拖拽把手图标
import { ApiOutlined, FileTextOutlined, HolderOutlined } from '@ant-design/icons';

const { Text } = Typography;

const LoadAssetNode: React.FC<NodeProps> = (props) => {
  const { id, data, isConnectable } = props;
  const { updateNodeData } = useCanvasStore();

  const [asset, setAsset] = useState<any>(data.asset || null);

  useEffect(() => {
    if (data.asset) {
      setAsset(data.asset);
    }
  }, [data.asset]);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: { asset: any }) => {
      handleAssetDrop(item.asset);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  const handleAssetDrop = (droppedAsset: any) => {
    setAsset(droppedAsset);

    const outputType = droppedAsset.type === 'prompt' ? 'text' : droppedAsset.type;

    const newOutputPorts = {
      output: {
        type: outputType,
        label: droppedAsset.name
      }
    };

    updateNodeData(id, {
      asset: droppedAsset,
      outputs: newOutputPorts,
      label: `加载资产: ${droppedAsset.name}`
    });
  };

const renderPreview = () => {
    if (!asset) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="拖拽资产到此" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;

    const previewUrl = asset.thumbnail || (asset.data?.file_path ? `http://localhost:8000/${asset.data.file_path}` : null);

    return (
      // 🚀 核心修复：媒体容器占满剩余空间，图片/视频使用 object-fit: contain
      <div className="nodrag" style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {asset.type === 'image' && previewUrl && (
          <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} />
        )}

        {asset.type === 'video' && previewUrl && (
          <video src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} controls={true} autoPlay muted loop />
        )}

        {asset.type === 'prompt' && (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: '#f6ffed', padding: '6px 8px', borderRadius: 6, border: '1px solid #b7eb8f', fontSize: '12px', color: '#389e0d', textAlign: 'left' }}>
            <FileTextOutlined style={{ marginRight: 4 }} />
            {asset.data?.content || asset.name}
          </div>
        )}

        {asset.type === 'workflow' && (
          <div style={{ width: '100%', height: '100%', background: '#f9f0ff', padding: '8px', borderRadius: 6, border: '1px solid #d3adf7', color: '#531dab', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <div style={{ fontWeight: 'bold' }}><ApiOutlined style={{ marginRight: 4 }} />{asset.name || "工作流模板"}</div>
            <div style={{ fontSize: '10px', color: '#9254de' }}>(JSON 配置已加载)</div>
          </div>
        )}

        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4, flexShrink: 0 }}>资产 ID: {asset.id}</Text>
      </div>
    );
  };

  const renderDynamicHandle = () => {
    if (!asset) return null;

    let handleColor = '#d9d9d9';
    let tooltipText = '数据输出';

    if (asset.type === 'prompt') { handleColor = '#52c41a'; tooltipText = '输出文本/提示词'; }
    else if (asset.type === 'image') { handleColor = '#1890ff'; tooltipText = '输出图像流'; }
    else if (asset.type === 'video') { handleColor = '#eb2f96'; tooltipText = '输出视频流'; }
    else if (asset.type === 'workflow') { handleColor = '#722ed1'; tooltipText = '输出工作流 JSON'; }

    return (
      <Tooltip title={tooltipText} placement="right">
        <Handle type="source" position={Position.Right} id="output" isConnectable={isConnectable} style={{ background: handleColor, width: 12, height: 12, border: '2px solid #fff' }} />
      </Tooltip>
    );
  };

return (
    <BaseNode {...props}>
      {/* 🚀 核心修复：外壳 100% 填充 */}
      <div
        ref={drop}
        style={{
          width: '100%',
          height: '100%',
          border: isOver ? '2px dashed #1890ff' : '1px dashed #d9d9d9',
          borderRadius: 8,
          padding: '8px',
          background: isOver ? '#f0f7ff' : '#fafafa',
          transition: 'all 0.3s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 0,
          minHeight: 0
        }}
      >
        <HolderOutlined style={{ color: '#d9d9d9', fontSize: 14, cursor: 'grab', marginBottom: 4, flexShrink: 0 }} />
        {renderPreview()}
      </div>

      {renderDynamicHandle()}
    </BaseNode>
  );
};

if (!nodeRegistry.get('load_asset')) {
  nodeRegistry.register({
    type: 'load_asset', displayName: '📦 加载资产', component: LoadAssetNode,
    defaultData: { label: '加载资产', outputs: { output: { type: 'any', label: '输出' } } }
  });
}

export default LoadAssetNode;