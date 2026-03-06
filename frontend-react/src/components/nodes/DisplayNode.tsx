import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Typography, Empty, Button, Modal, Input, message, Tooltip } from 'antd';
import { DesktopOutlined, SaveOutlined, TagsOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';
import { useParams } from 'react-router-dom';

const { Text, Paragraph } = Typography;

const DisplayNode: React.FC<NodeProps> = (props) => {
  const { data, isConnectable } = props;
  const { fetchAssets } = useAssetLibraryStore();

  const params = useParams<{ id: string }>();
  let projectId = params.id;
  if (!projectId) {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    if (match) projectId = match[1];
  }

  const displayData = data.incoming_data || data.result;

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetTags, setAssetTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const renderContent = () => {
    if (!displayData) {
      return (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, minHeight: 0 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary" style={{ fontSize: 12 }}>等待上游数据流...</Text>} />
        </div>
      );
    }

    switch (displayData.type) {
      case 'text':
      case 'chat':
      case 'prompt':
        return (
          <div className="nodrag" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, border: '1px solid #e8e8e8', minWidth: 0, minHeight: 0 }}>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.6' }}>{displayData.content}</Paragraph>
          </div>
        );
      case 'image':
        const imgSrc = displayData.content.startsWith('http') || displayData.content.startsWith('data:') ? displayData.content : `data:image/jpeg;base64,${displayData.content}`;
        return (
          // 🚀 第 4 层彻底降维：minWidth: 0, minHeight: 0，里面包含 object-fit: contain 的原生图片
          <div className="nodrag" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#fafafa', padding: 8, borderRadius: 6, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
            <img
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }}
              src={imgSrc}
              alt="AI Generated Image"
            />
          </div>
        );
      case 'video':
        const vidSrc = displayData.content.startsWith('http') || displayData.content.startsWith('data:') ? displayData.content : `data:video/mp4;base64,${displayData.content}`;
        return (
          // 🚀 第 5 层彻底降维：minWidth: 0, minHeight: 0，里面包含 object-fit: contain 的原生视频
          <div className="nodrag" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', padding: 4, borderRadius: 6, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
            <video controls style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} src={vidSrc} />
          </div>
        );
      default:
        return <Text type="danger">不支持的渲染类型: {displayData.type}</Text>;
    }
  };

  const handleSaveAsset = async () => {
    if (!assetName.trim()) return message.warning('请给资产起个名字吧');
    setIsSaving(true);
    try {
      let finalType = displayData.type;
      if (finalType === 'chat' || finalType === 'text') finalType = 'prompt';

      const payload = {
        name: assetName,
        type: finalType,
        tags: assetTags ? assetTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
        data: { content: displayData.content },
        project_id: projectId ? Number(projectId) : null
      };

      await apiClient.post('/assets/', payload);
      message.success('🎉 成功沉淀至项目资产库！');
      setIsModalVisible(false);
      setAssetName('');
      setAssetTags('');
      fetchAssets(projectId ? Number(projectId) : undefined);
    } catch (error: any) {
      message.error(`保存失败: ${error.response?.data?.detail || '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BaseNode {...props}>
      {/* 🚀 主骨架强制使用 flex + minWidth: 0, minHeight: 0 彻底击溃撑爆限制 */}
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} id="in" style={{ top: '50%', background: '#52c41a', width: 10, height: 10 }} />

        <div style={{ flexShrink: 0, marginBottom: 12, borderBottom: '1px solid #f0f0f0', paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DesktopOutlined style={{ color: '#52c41a' }} />
            <Text strong style={{ color: '#595959' }}>结果展示</Text>
          </div>
          {displayData && (
            <Tooltip title="将此结果固化为资产">
              <Button type="text" size="small" icon={<SaveOutlined style={{ color: '#1890ff' }} />} onClick={() => setIsModalVisible(true)}>存为资产</Button>
            </Tooltip>
          )}
        </div>

        {/* 🚀 媒体渲染区外壳 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            {renderContent()}
        </div>

        <Handle type="source" position={Position.Right} isConnectable={isConnectable} id="out" style={{ top: '50%', background: '#fa8c16', width: 10, height: 10 }} />
      </div>

      <Modal title="💾 固化为资产" open={isModalVisible} onOk={handleSaveAsset} confirmLoading={isSaving} onCancel={() => setIsModalVisible(false)} okText="保存至资产库" width={360}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <Input placeholder="给这个资产起个响亮的名字..." value={assetName} onChange={(e) => setAssetName(e.target.value)} autoFocus />
          <Input prefix={<TagsOutlined style={{ color: '#bfbfbf' }} />} placeholder="标签 (选填，用逗号分隔)" value={assetTags} onChange={(e) => setAssetTags(e.target.value)} />
        </div>
      </Modal>
    </BaseNode>
  );
};

if (!nodeRegistry.get('display')) {
  nodeRegistry.register({ type: 'display', displayName: '📺 结果展示', component: DisplayNode, defaultData: { label: '📺 结果展示' } });
}

export default DisplayNode;