// frontend-react/src/components/nodes/DisplayNode.tsx
import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Typography, Tooltip, Button, message, Modal, Input } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useParams } from 'react-router-dom';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';

const { Text } = Typography;

export default function DisplayNode(props: NodeProps) {
  const { data, id } = props;
  const { id: projectId } = useParams<{ id: string }>();
  const fetchAssets = useAssetLibraryStore((state) => state.fetchAssets);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [savingAsset, setSavingAsset] = useState(false);

  // 🌟 1. 核心修复：智能解析上游传入的数据，防止 Object 直接渲染导致 React 崩溃！
  let rawData = data.incoming_data || data.result || data.asset?.data || data.content;
  let displayContent = '';
  let mediaType = 'text'; // 默认是文本，支持 'image' 和 'video'

  if (rawData !== undefined && rawData !== null) {
    if (typeof rawData === 'string') {
      displayContent = rawData;
      // 简单猜测类型
      if (displayContent.match(/\.(mp4|webm|mov|gif)(\?|$)/i)) mediaType = 'video';
      else if (displayContent.match(/\.(jpeg|jpg|png|webp)(\?|$)/i) || displayContent.startsWith('data:image')) mediaType = 'image';
    } else if (typeof rawData === 'object') {
      // 🌟 精准剥离：如果是 { content: "...", type: "text" } 这种对象，安全提取 content
      displayContent = rawData.content || rawData.url || rawData.file_path || JSON.stringify(rawData, null, 2);
      
      if (rawData.type === 'video' || (typeof displayContent === 'string' && displayContent.match(/\.(mp4|webm|mov|gif)(\?|$)/i))) {
        mediaType = 'video';
      } else if (rawData.type === 'image' || (typeof displayContent === 'string' && (displayContent.match(/\.(jpeg|jpg|png|webp)(\?|$)/i) || displayContent.startsWith('data:image')))) {
        mediaType = 'image';
      }
    }
  }

  // 兜底保障：绝对不能让对象流入 React 渲染树
  if (typeof displayContent !== 'string') {
    displayContent = String(displayContent);
  }

  const handleSaveToAsset = async () => {
    if (!displayContent) return message.warning('没有可保存的内容');
    if (!assetName.trim()) return message.warning('请输入资产名称');

    setSavingAsset(true);
    try {
      await apiClient.post('/assets/', {
        name: assetName,
        type: mediaType === 'video' ? 'video' : (mediaType === 'image' ? 'image' : 'prompt'),
        data: { 
            content: displayContent, 
            url: mediaType !== 'text' ? displayContent : undefined,
            file_path: mediaType !== 'text' ? displayContent : undefined
        },
        tags: ['Display_Saved'],
        thumbnail: mediaType === 'image' ? displayContent : undefined,
        project_id: projectId ? Number(projectId) : null
      });
      message.success('已保存到资产库');
      setIsModalVisible(false);
      setAssetName('');
      if (projectId) fetchAssets(Number(projectId));
    } catch (error: any) {
      message.error(`保存失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSavingAsset(false);
    }
  };

  return (
    <BaseNode {...props}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: '50%', background: '#10b981', width: 10, height: 10 }} />
      
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>接收到的产物：</Text>
          {displayContent && (
             <Tooltip title="固化为资产">
               <Button type="text" size="small" icon={<SaveOutlined />} onClick={() => setIsModalVisible(true)} style={{ color: '#0ea5e9' }} />
             </Tooltip>
          )}
        </div>

        <div className="nodrag" style={{ flex: 1, background: '#f8fafc', borderRadius: 6, border: '1px dashed #cbd5e1', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 100 }}>
          {displayContent ? (
            // 🌟 2. 根据媒体类型智能匹配渲染器
            mediaType === 'video' ? (
               <video src={displayContent} controls autoPlay loop muted style={{ maxWidth: '100%', maxHeight: 250, objectFit: 'contain', borderRadius: 4 }} />
            ) : mediaType === 'image' ? (
               <img src={displayContent} style={{ maxWidth: '100%', maxHeight: 250, objectFit: 'contain', borderRadius: 4 }} alt="Display" />
            ) : (
               <div style={{ padding: 8, width: '100%', maxHeight: 200, overflowY: 'auto', fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                 {displayContent}
               </div>
            )
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>等待输入...</Text>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" style={{ top: '50%', background: '#fa8c16', width: 10, height: 10 }} />

      <Modal title="保存资产" open={isModalVisible} onOk={handleSaveToAsset} onCancel={() => setIsModalVisible(false)} confirmLoading={savingAsset} okText="保存" cancelText="取消" width={320}>
        <Input placeholder="给这个资产起个名字吧..." value={assetName} onChange={e => setAssetName(e.target.value)} autoFocus />
      </Modal>
    </BaseNode>
  );
}

if (!nodeRegistry.get('display')) {
  nodeRegistry.register({ type: 'display', displayName: '📺 结果展示', component: DisplayNode, defaultData: { label: '📺 结果展示' } });
}