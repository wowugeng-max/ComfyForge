import React, { useState, useEffect } from 'react';
import { type NodeProps } from 'reactflow';
import { useDrop } from 'react-dnd';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { DndItemTypes } from '../../constants/dnd';
import { useCanvasStore } from '../../stores/canvasStore';
import { Typography, Empty } from 'antd';

const { Text } = Typography;

const LoadAssetNode: React.FC<NodeProps> = (props) => {
  const { id, data } = props;
  const { updateNodeData } = useCanvasStore();

  // 从节点数据中初始化状态
  const [asset, setAsset] = useState<any>(data.asset || null);

  // 监听外部数据变化（如撤销/重做时）
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

    // 1. 根据资产类型定义输出端口
    // 这里的逻辑对应项目书中的“资产驱动”：不同资产产生不同输出
    const outputType = droppedAsset.type === 'prompt' ? 'text' : droppedAsset.type;

    const newOutputPorts = {
      output: {
        type: outputType,
        label: droppedAsset.name
      }
    };

    // 2. 更新全局 Store 中的节点数据
    updateNodeData(id, {
      asset: droppedAsset,
      outputs: newOutputPorts,
      label: `加载资产: ${droppedAsset.name}`
    });
  };

  const renderPreview = () => {
    if (!asset) return <Empty description="拖拽资产到此" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

    // 处理预览 URL（如果是本地路径，后端需要提供静态资源服务映射）
    const previewUrl = asset.thumbnail || (asset.data?.file_path ? `http://localhost:8000/${asset.data.file_path}` : null);

    return (
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        {asset.type === 'image' && previewUrl && (
          <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', borderRadius: 4 }} />
        )}
        {asset.type === 'video' && previewUrl && (
          <video src={previewUrl} style={{ maxWidth: '100%' }} controls={false} autoPlay muted loop />
        )}
        {asset.type === 'prompt' && (
          <div style={{
            background: '#f5f5f5',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: '12px',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {asset.data?.content || asset.name}
          </div>
        )}
        <Text type="secondary" style={{ fontSize: 10 }}>ID: {asset.id}</Text>
      </div>
    );
  };

  return (
    <BaseNode {...props}>
      <div
        ref={drop}
        className="nodrag" // 内部交互不触发画布拖拽
        style={{
          minHeight: 80,
          border: isOver ? '2px dashed #1890ff' : '1px dashed #d9d9d9',
          borderRadius: 4,
          padding: 8,
          background: isOver ? '#f0f7ff' : '#fafafa',
          transition: 'all 0.3s'
        }}
      >
        {renderPreview()}
      </div>
    </BaseNode>
  );
};

// 注册节点到注册表
if (!nodeRegistry.get('load_asset')) {
  nodeRegistry.register({
    type: 'load_asset',
    displayName: '加载资产',
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