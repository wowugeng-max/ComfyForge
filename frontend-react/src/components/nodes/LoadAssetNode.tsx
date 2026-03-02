import React, { useState } from 'react';
import {type NodeProps, useReactFlow } from 'reactflow';
import { useDrop } from 'react-dnd';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { DndItemTypes } from '../../constants/dnd';

const LoadAssetNode: React.FC<NodeProps> = (props) => {
  const { id, data } = props;
  const [asset, setAsset] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { setNodes } = useReactFlow();

  // 调试日志
  console.log('🎨 LoadAssetNode rendering', { id, asset, previewUrl, data });

  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: { asset: any }) => {
      console.log('🔥 drop received in LoadAssetNode', item);
      handleAssetDrop(item.asset);
    },
    hover: (item) => {
      console.log('👀 hovering over LoadAssetNode', item);
    },
    canDrop: (item) => {
      console.log('✅ canDrop in LoadAssetNode', item);
      return true;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  const handleAssetDrop = async (droppedAsset: any) => {
    console.log('🔄 handleAssetDrop called with:', droppedAsset);

    // 保存资产数据到状态
    setAsset(droppedAsset);

    // 构建预览 URL
    let url = null;
    if (droppedAsset.thumbnail) {
      url = droppedAsset.thumbnail;
    } else if (droppedAsset.data?.file_path) {
      // 提取文件名，假设 file_path 是类似 "data/assets/images/xxx.png" 或 "data/assets/videos/xxx.mp4"
      const filePath = droppedAsset.data.file_path;
      const fileName = filePath.split(/[\\/]/).pop();
      url = `/api/files/${fileName}`;
    } else if (droppedAsset.type === 'prompt') {
      // 提示词不需要预览 URL，但可以显示文本
      url = null;
    }
    setPreviewUrl(url);

    // 根据资产类型设置节点数据和输出端口
    let newData = {
      ...data,
      assetId: droppedAsset.id,
      assetType: droppedAsset.type,
      assetName: droppedAsset.name,
    };

    // 动态设置 outputs（用于端口显示）
    if (droppedAsset.type === 'image') {
      newData.outputs = { image: { type: 'image', label: 'Image' } };
    } else if (droppedAsset.type === 'prompt') {
      newData.outputs = { text: { type: 'text', label: 'Prompt' } };
    } else if (droppedAsset.type === 'video') {
      newData.outputs = { video: { type: 'video', label: 'Video' } };
    }

    console.log('📦 newData:', newData);

    // 更新节点数据
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: newData };
        }
        return node;
      })
    );
  };

  return (
    <BaseNode {...props}>
      <div
        ref={drop}
        style={{
          minHeight: 60,
          border: isOver ? '2px dashed #1890ff' : '1px dashed #ccc',
          borderRadius: 4,
          padding: 8,
          textAlign: 'center',
          background: '#fff',
        }}
      >
        {previewUrl ? (
          asset?.type === 'image' ? (
            <img src={previewUrl} alt="预览" style={{ maxWidth: '100%', maxHeight: 100 }} />
          ) : asset?.type === 'video' ? (
            <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: 100 }} />
          ) : (
            <div>提示词: {asset?.name}</div>
          )
        ) : asset ? (
          <div>{asset.type === 'prompt' ? `提示词: ${asset.name}` : '无法预览'}</div>
        ) : (
          <span style={{ color: '#999' }}>拖拽资产到此</span>
        )}
      </div>
    </BaseNode>
  );
};

// 注册节点（确保只注册一次）
if (!nodeRegistry.get('loadAsset')) {
  nodeRegistry.register({
    type: 'loadAsset',
    displayName: 'Load Asset',
    component: LoadAssetNode,
    defaultData: {
      label: 'Load Asset',
      assetType: null,
    },
    inputs: {},
    outputs: {}, // 动态更新
  });
}

export default LoadAssetNode;