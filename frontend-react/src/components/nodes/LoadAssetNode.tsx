import React, { useState, useEffect } from 'react';
import { type NodeProps } from 'reactflow';
import { useDrop } from 'react-dnd';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { DndItemTypes } from '../../constants/dnd';
import { useCanvasStore } from '../../stores/canvasStore';
import { Typography, Empty } from 'antd';
import { ApiOutlined, FileTextOutlined } from '@ant-design/icons';

const { Text } = Typography;

const LoadAssetNode: React.FC<NodeProps> = (props) => {
  const { id, data } = props;
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
    console.log('📦 Asset dropped:', droppedAsset);
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
    if (!asset) return <Empty description="拖拽资产到此" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    const previewUrl = asset.thumbnail || (asset.data?.file_path ? `http://localhost:8000/${asset.data.file_path}` : null);

    return (
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        {asset.type === 'image' && previewUrl && (
          <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 4 }} />
        )}

        {asset.type === 'video' && previewUrl && (
          <video src={previewUrl} style={{ maxWidth: '100%' }} controls={false} autoPlay muted loop />
        )}

        {/* 提示词的展示 UI */}
        {asset.type === 'prompt' && (
          <div style={{
            background: '#f6ffed', // 浅绿色背景
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid #b7eb8f',
            fontSize: '12px',
            color: '#389e0d',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'left'
          }}>
            <FileTextOutlined style={{ marginRight: 4 }} />
            {asset.data?.content || asset.name}
          </div>
        )}

        {/* 🌟 核心修复：为工作流 (workflow) 添加绝美的展示 UI */}
        {asset.type === 'workflow' && (
          <div style={{
            background: '#f9f0ff', // 浅紫色背景
            padding: '8px',
            borderRadius: 6,
            border: '1px solid #d3adf7',
            color: '#531dab',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px'
          }}>
            <div style={{ fontWeight: 'bold' }}>
              <ApiOutlined style={{ marginRight: 4 }} />
              {asset.name || "工作流模板"}
            </div>
            <div style={{ fontSize: '10px', color: '#9254de' }}>
              (JSON 配置已加载)
            </div>
          </div>
        )}

        <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 8 }}>
          资产 ID: {asset.id}
        </Text>
      </div>
    );
  };

  return (
    <BaseNode {...props}>
      <div
        ref={drop}
        className="nodrag"
        style={{
          minHeight: 80,
          minWidth: 120,
          border: isOver ? '2px dashed #1890ff' : '1px dashed #d9d9d9',
          borderRadius: 8,
          padding: '12px 8px',
          background: isOver ? '#f0f7ff' : '#fafafa',
          transition: 'all 0.3s'
        }}
      >
        {renderPreview()}
      </div>
    </BaseNode>
  );
};

if (!nodeRegistry.get('load_asset')) {
  nodeRegistry.register({
    type: 'load_asset',
    displayName: '📦 加载资产',
    component: LoadAssetNode,
    defaultData: {
      label: '加载资产',
      outputs: {
        output: { type: 'any', label: '输出' }
      }
    }
  });
}

export default LoadAssetNode;