import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Typography, Image, Empty, Button, Modal, Input, message, Tooltip } from 'antd';
import { DesktopOutlined, SaveOutlined, TagsOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';
import { useParams } from 'react-router-dom';

const { Text, Paragraph } = Typography;

const DisplayNode: React.FC<NodeProps> = (props) => {
  const { data, isConnectable } = props;
  const { fetchAssets } = useAssetLibraryStore();

  // 🌟 核心防御 1：防止 ReactFlow 丢失 Context，双重保险获取项目 ID！
  const params = useParams<{ id: string }>();
  let projectId = params.id;
  if (!projectId) {
    // 如果 useParams 失效，直接从浏览器地址栏暴力扒取！
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
        <div style={{ padding: '20px 0' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary" style={{ fontSize: 12 }}>等待上游数据流...</Text>} />
        </div>
      );
    }

    switch (displayData.type) {
      case 'text':
      case 'chat':
      case 'prompt':
        return (
          <div className="nodrag" style={{ maxHeight: 250, overflowY: 'auto', padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, border: '1px solid #e8e8e8' }}>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.6' }}>{displayData.content}</Paragraph>
          </div>
        );
      case 'image':
        const imgSrc = displayData.content.startsWith('http') || displayData.content.startsWith('data:') ? displayData.content : `data:image/jpeg;base64,${displayData.content}`;
        return (
          <div className="nodrag" style={{ display: 'flex', justifyContent: 'center', background: '#fafafa', padding: 8, borderRadius: 6 }}>
            <Image width="100%" style={{ maxHeight: 300, objectFit: 'contain', borderRadius: 4 }} src={imgSrc} alt="AI Generated Image" />
          </div>
        );
      case 'video':
        const vidSrc = displayData.content.startsWith('http') || displayData.content.startsWith('data:') ? displayData.content : `data:video/mp4;base64,${displayData.content}`;
        return (
          <div className="nodrag" style={{ display: 'flex', justifyContent: 'center', background: '#000', padding: 4, borderRadius: 6 }}>
            <video controls style={{ width: '100%', maxHeight: 300, borderRadius: 4 }} src={vidSrc} />
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
      // 🌟 核心防御 2：严防死守！只要是文本变体，强制扭转为 prompt，防止被列表抛弃！
      let finalType = displayData.type;
      if (finalType === 'chat' || finalType === 'text') {
        finalType = 'prompt';
      }

      const payload = {
        name: assetName,
        type: finalType,
        tags: assetTags ? assetTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
        data: {
          content: displayData.content
        },
        // 这次，ID 绝对不可能丢了！
        project_id: projectId ? Number(projectId) : null
      };

      await apiClient.post('/assets/', payload);
      message.success('🎉 成功沉淀至项目资产库！');

      setIsModalVisible(false);
      setAssetName('');
      setAssetTags('');

      // 精准刷新当前项目的列表
      fetchAssets(projectId ? Number(projectId) : undefined);

    } catch (error: any) {
      message.error(`保存失败: ${error.response?.data?.detail || '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BaseNode {...props}>
      <div style={{ width: 280, minHeight: 120 }}>
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} id="in" style={{ top: '50%', background: '#52c41a', width: 10, height: 10 }} />
        <div style={{ marginBottom: 12, borderBottom: '1px solid #f0f0f0', paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        {renderContent()}
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