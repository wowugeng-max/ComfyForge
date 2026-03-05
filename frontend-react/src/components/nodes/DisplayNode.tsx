import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Typography, Image, Empty, Button, Modal, Input, message, Tooltip } from 'antd';
import { DesktopOutlined, SaveOutlined, TagsOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';

const { Text, Paragraph } = Typography;

const DisplayNode: React.FC<NodeProps> = (props) => {
  const { data, isConnectable } = props;

  // 引入资产库的 Store，用于保存后自动刷新左侧列表
  const { fetchAssets } = useAssetLibraryStore();

  // 🌟 修正数据源：优先读取 GenerateNode 顺着连线推过来的 incoming_data
  const displayData = data.incoming_data || data.result;

  // --- 资产保存相关的状态 ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetTags, setAssetTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // --- 核心魔法：多模态渲染引擎 ---
  const renderContent = () => {
    if (!displayData) {
      return (
        <div style={{ padding: '20px 0' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary" style={{ fontSize: 12 }}>等待上游数据流...</Text>}
          />
        </div>
      );
    }

    switch (displayData.type) {
      case 'text':
      case 'chat':
      case 'prompt':
        return (
          <div className="nodrag" style={{
            maxHeight: 250, overflowY: 'auto', padding: '8px 12px',
            background: '#f5f5f5', borderRadius: 6, border: '1px solid #e8e8e8'
          }}>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.6' }}>
              {displayData.content}
            </Paragraph>
          </div>
        );

      case 'image':
        // 兼容完整的 URL 或者后端的纯 base64 字符串
        const imgSrc = displayData.content.startsWith('http') || displayData.content.startsWith('data:')
          ? displayData.content
          : `data:image/jpeg;base64,${displayData.content}`;
        return (
          <div className="nodrag" style={{ display: 'flex', justifyContent: 'center', background: '#fafafa', padding: 8, borderRadius: 6 }}>
            <Image
              width="100%"
              style={{ maxHeight: 300, objectFit: 'contain', borderRadius: 4 }}
              src={imgSrc}
              alt="AI Generated Image"
            />
          </div>
        );

      case 'video':
        const vidSrc = displayData.content.startsWith('http') || displayData.content.startsWith('data:')
          ? displayData.content
          : `data:video/mp4;base64,${displayData.content}`;
        return (
          <div className="nodrag" style={{ display: 'flex', justifyContent: 'center', background: '#000', padding: 4, borderRadius: 6 }}>
            <video
              controls
              style={{ width: '100%', maxHeight: 300, borderRadius: 4 }}
              src={vidSrc}
            />
          </div>
        );

      default:
        return <Text type="danger">不支持的渲染类型: {displayData.type}</Text>;
    }
  };

  // 🌟 核心魔法：保存为资产
  const handleSaveAsset = async () => {
    if (!assetName.trim()) {
      return message.warning('请给资产起个名字吧');
    }

    setIsSaving(true);
    try {
      // 组装资产保存的 Payload
      const payload = {
        name: assetName,
        type: displayData.type === 'chat' ? 'prompt' : displayData.type, // 把文本统一存为 prompt 资产
        tags: assetTags ? assetTags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
        data: {
          content: displayData.content
        }
      };

      await apiClient.post('/assets/', payload);
      message.success('🎉 成功沉淀至资产库！');

      // 关闭弹窗并清空输入
      setIsModalVisible(false);
      setAssetName('');
      setAssetTags('');

      // 🌟 自动刷新左侧资产列表！
      fetchAssets();

    } catch (error: any) {
      message.error(`保存失败: ${error.response?.data?.detail || '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BaseNode {...props}>
      <div style={{ width: 280, minHeight: 120 }}>
        {/* 左侧输入句柄 (接收文本、图片或视频流) */}
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} id="in" style={{ top: '50%', background: '#52c41a', width: 10, height: 10 }} />

        <div style={{ marginBottom: 12, borderBottom: '1px solid #f0f0f0', paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DesktopOutlined style={{ color: '#52c41a' }} />
            <Text strong style={{ color: '#595959' }}>结果展示</Text>
          </div>

          {/* 只有在有数据的时候才显示保存按钮 */}
          {displayData && (
            <Tooltip title="将此结果固化为资产">
              <Button
                type="text"
                size="small"
                icon={<SaveOutlined style={{ color: '#1890ff' }} />}
                onClick={() => setIsModalVisible(true)}
              >
                存为资产
              </Button>
            </Tooltip>
          )}
        </div>

        {/* 动态渲染内容区域 */}
        {renderContent()}

        {/* 右侧输出句柄 (以便用户继续把它连给下一个 GenerateNode) */}
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} id="out" style={{ top: '50%', background: '#fa8c16', width: 10, height: 10 }} />
      </div>

      {/* 优雅的保存弹窗 */}
      <Modal
        title="💾 固化为资产"
        open={isModalVisible}
        onOk={handleSaveAsset}
        confirmLoading={isSaving}
        onCancel={() => setIsModalVisible(false)}
        okText="保存至资产库"
        cancelText="取消"
        width={360}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <Input
            placeholder="给这个资产起个响亮的名字..."
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            autoFocus
          />
          <Input
            prefix={<TagsOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="标签 (选填，用逗号分隔，如: 赛博朋克, 分镜)"
            value={assetTags}
            onChange={(e) => setAssetTags(e.target.value)}
          />
        </div>
      </Modal>
    </BaseNode>
  );
};

if (!nodeRegistry.get('display')) {
  nodeRegistry.register({ type: 'display', displayName: '📺 结果展示', component: DisplayNode, defaultData: { label: '📺 结果展示' } });
}

export default DisplayNode;