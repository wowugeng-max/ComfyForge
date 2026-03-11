// frontend-react/src/components/nodes/DisplayNode.tsx
import React, { useState, useEffect } from 'react';
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
  const [mediaDims, setMediaDims] = useState<string>('');

  let rawData = data.incoming_data || data.result || data.asset?.data || data.content;
  let displayContent = '';
  let mediaType = 'text';

  if (rawData !== undefined && rawData !== null) {
    if (typeof rawData === 'string') {
      displayContent = rawData;
      if (displayContent.match(/\.(mp4|webm|mov|gif)(\?|$)/i)) mediaType = 'video';
      else if (displayContent.match(/\.(jpeg|jpg|png|webp)(\?|$)/i) || displayContent.startsWith('data:image')) mediaType = 'image';
    } else if (typeof rawData === 'object') {
      displayContent = rawData.content || rawData.url || rawData.file_path || JSON.stringify(rawData, null, 2);
      if (rawData.type === 'video' || (typeof displayContent === 'string' && displayContent.match(/\.(mp4|webm|mov|gif)(\?|$)/i))) {
        mediaType = 'video';
      } else if (rawData.type === 'image' || (typeof displayContent === 'string' && (displayContent.match(/\.(jpeg|jpg|png|webp)(\?|$)/i) || displayContent.startsWith('data:image')))) {
        mediaType = 'image';
      }
    }
  }

  if (typeof displayContent !== 'string') displayContent = String(displayContent);

  useEffect(() => { setMediaDims(''); }, [displayContent]);

  const handleSaveToAsset = async () => {
    if (!displayContent) return message.warning('没有可保存的内容');
    if (!assetName.trim()) return message.warning('请输入资产名称');
    setSavingAsset(true);
    try {
      await apiClient.post('/assets/', {
        name: assetName, type: mediaType === 'video' ? 'video' : (mediaType === 'image' ? 'image' : 'prompt'),
        data: { content: displayContent, url: mediaType !== 'text' ? displayContent : undefined, file_path: mediaType !== 'text' ? displayContent : undefined },
        tags: ['Display_Saved'], thumbnail: mediaType === 'image' ? displayContent : undefined, project_id: projectId ? Number(projectId) : null
      });
      message.success('已保存到资产库');
      setIsModalVisible(false); setAssetName(''); if (projectId) fetchAssets(Number(projectId));
    } catch (error: any) { message.error(`保存失败: ${error.response?.data?.detail || error.message}`); } finally { setSavingAsset(false); }
  };

  return (
    <BaseNode {...props}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: '50%', background: '#10b981', width: 12, height: 12 }} />

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>VISUAL_OUTPUT</Text>
          {displayContent && (
             <Tooltip title="固化为资产">
               <Button type="text" size="small" icon={<SaveOutlined />} onClick={() => setIsModalVisible(true)} style={{ color: '#0ea5e9', fontSize: 16 }} />
             </Tooltip>
          )}
        </div>

        {/* 🌟 核心修改：移除容器 nodrag，让大块图片区域可以随意点击拖拽 */}
        <div style={{ flex: 1, position: 'relative', background: mediaType === 'text' ? '#f8fafc' : '#0f172a', borderRadius: 8, border: '1px solid #cbd5e1', overflow: 'hidden', minHeight: 120 }}>
          {mediaType !== 'text' && mediaDims && (
            <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#f8fafc', fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, zIndex: 10, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
              {mediaDims}
            </div>
          )}

          {displayContent ? (
            mediaType === 'video' ? (
               <video src={displayContent} controls autoPlay loop muted style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} onLoadedMetadata={(e) => setMediaDims(`${(e.target as HTMLVideoElement).videoWidth} × ${(e.target as HTMLVideoElement).videoHeight}`)} />
            ) : mediaType === 'image' ? (
               <img src={displayContent} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'high-quality' }} alt="Display" onLoad={(e) => setMediaDims(`${(e.target as HTMLImageElement).naturalWidth} × ${(e.target as HTMLImageElement).naturalHeight}`)} />
            ) : (
               // 🌟 文本滚动区增加 nodrag nowheel 防止复制和滚动冲突
               <div className="nodrag nowheel" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', padding: 12, overflowY: 'auto', fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                 {displayContent}
               </div>
            )
          ) : (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, color: '#94a3b8' }}>等待信号输入...</Text>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" style={{ top: '50%', background: '#fa8c16', width: 12, height: 12 }} />

      <Modal title="保存资产" open={isModalVisible} onOk={handleSaveToAsset} onCancel={() => setIsModalVisible(false)} confirmLoading={savingAsset} okText="保存" cancelText="取消" width={320}>
        <Input placeholder="给这个资产起个名字吧..." value={assetName} onChange={e => setAssetName(e.target.value)} autoFocus />
      </Modal>
    </BaseNode>
  );
}

if (!nodeRegistry.get('display')) {
  nodeRegistry.register({ type: 'display', displayName: '📺 结果展示', component: DisplayNode, defaultData: { label: '📺 结果展示' } });
}