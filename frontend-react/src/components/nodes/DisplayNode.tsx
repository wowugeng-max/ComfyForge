import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Typography, Image, Empty } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const DisplayNode: React.FC<NodeProps> = (props) => {
  const { data, isConnectable } = props;

  // 这里的 data.result 将在下一步（连线流转）中由 GenerateNode 传过来
  const result = data.result;

  // --- 核心魔法：多模态渲染引擎 ---
  const renderContent = () => {
    if (!result) {
      return (
        <div style={{ padding: '20px 0' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary" style={{ fontSize: 12 }}>等待输入流...</Text>}
          />
        </div>
      );
    }

    switch (result.type) {
      case 'text':
        return (
          <div className="nodrag" style={{
            maxHeight: 250, overflowY: 'auto', padding: '8px 12px',
            background: '#f5f5f5', borderRadius: 6, border: '1px solid #e8e8e8'
          }}>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.6' }}>
              {result.content}
            </Paragraph>
          </div>
        );

      case 'image':
        // 兼容完整的 URL 或者我们后端的纯 base64 字符串
        const imgSrc = result.content.startsWith('http') || result.content.startsWith('data:')
          ? result.content
          : `data:image/jpeg;base64,${result.content}`;
        return (
          <div className="nodrag" style={{ display: 'flex', justifyContent: 'center', background: '#fafafa', padding: 8, borderRadius: 6 }}>
            {/* 使用 Ant Design 的 Image 组件，自带点击放大预览功能！ */}
            <Image
              width="100%"
              style={{ maxHeight: 300, objectFit: 'contain', borderRadius: 4 }}
              src={imgSrc}
              alt="AI Generated Image"
            />
          </div>
        );

      case 'video':
        const vidSrc = result.content.startsWith('http') || result.content.startsWith('data:')
          ? result.content
          : `data:video/mp4;base64,${result.content}`;
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
        return <Text type="danger">不支持的渲染类型: {result.type}</Text>;
    }
  };

  return (
    <BaseNode {...props}>
      <div style={{ width: 280, minHeight: 120 }}>
        {/* 左侧输入句柄，用于接收上一个节点的连线 */}
        <Handle type="target" position={Position.Left} isConnectable={isConnectable} id="in" />

        <div style={{ marginBottom: 12, borderBottom: '1px solid #f0f0f0', paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <DesktopOutlined style={{ color: '#52c41a' }} />
          <Text strong>结果展示</Text>
        </div>

        {/* 动态渲染内容区域 */}
        {renderContent()}

        {/* 右侧输出句柄，如果有需要可以继续往下传 */}
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} id="out" />
      </div>
    </BaseNode>
  );
};

// 注册节点到全局仓库
if (!nodeRegistry.get('display')) {
  nodeRegistry.register({ type: 'display', displayName: '展示器', component: DisplayNode });
}

export default DisplayNode;