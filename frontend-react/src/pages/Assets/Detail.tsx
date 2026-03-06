import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, Spin, Button, message, Typography, Row, Col, Tag, Space, Divider, Popconfirm } from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined,
  PictureOutlined, VideoCameraOutlined, FileTextOutlined,
  ApiOutlined, AppstoreAddOutlined, CodeOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { projectApi } from '../../api/projects';

const { Title, Text, Paragraph } = Typography;

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<any>(null);
  const [projectName, setProjectName] = useState<string>('全局公共');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await apiClient.get(`/assets/${id}`);
        const assetData = res.data;
        setAsset(assetData);

        // 解析归属项目名称
        if (assetData.project_id) {
          const projRes = await projectApi.getById(assetData.project_id);
          setProjectName(projRes.data.name);
        }
      } catch (error) {
        message.error('资产读取失败');
        navigate('/assets');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, navigate]);

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/assets/${id}`);
      message.success('🎉 资产已销毁');
      navigate('/assets');
    } catch {
      message.error('删除失败');
    }
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'image': return { icon: <PictureOutlined />, color: '#1890ff', label: '图像资产' };
      case 'video': return { icon: <VideoCameraOutlined />, color: '#eb2f96', label: '视频资产' };
      case 'prompt': return { icon: <FileTextOutlined />, color: '#52c41a', label: '提示词资产' };
      case 'workflow': return { icon: <ApiOutlined />, color: '#722ed1', label: '工作流配置' };
      case 'character': return { icon: <AppstoreAddOutlined />, color: '#fa8c16', label: '角色设定' };
      default: return { icon: <FileTextOutlined />, color: '#8c8c8c', label: type };
    }
  };

  // 🌟 左侧核心视窗：完美呈现内容
  const renderVisualizer = () => {
    if (!asset) return null;
    const { type, data, thumbnail } = asset;
    const src = thumbnail || (data?.file_path ? `http://localhost:8000/${data.file_path}` : null);

    if (type === 'image') {
      return (
        <div style={{ background: '#f0f2f5', borderRadius: 12, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          {src ? <img src={src} alt={asset.name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} /> : <Empty description="图像丢失" />}
        </div>
      );
    }
    if (type === 'video') {
      return (
        <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          {src ? <video src={src} controls style={{ maxWidth: '100%', maxHeight: '70vh' }} /> : <Empty description="视频丢失" />}
        </div>
      );
    }

    // 文本/工作流类型展示精美的代码块
    return (
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, minHeight: 400, overflow: 'auto', border: '1px solid #334155' }}>
        <div style={{ color: '#94a3b8', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CodeOutlined /> <Text style={{ color: '#94a3b8', fontFamily: 'monospace' }}>SOURCE_DATA_PAYLOAD</Text>
        </div>
        <pre style={{ margin: 0, color: '#38bdf8', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    );
  };

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  if (!asset) return null;

  const config = getTypeConfig(asset.type);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px 32px' }}>
      {/* 顶部操作条 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Space size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')} type="text" style={{ fontSize: 16, color: '#64748b' }} />
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>{asset.name}</Title>
          <Tag color={config.color} style={{ margin: 0, borderRadius: 16, padding: '2px 10px', fontSize: 13, border: 'none' }}>
            {config.icon} {config.label}
          </Tag>
        </Space>
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/assets/${asset.id}/edit`)}>编辑</Button>
          <Popconfirm title="确定销毁此资产吗？操作不可逆。" onConfirm={handleDelete} okText="销毁" cancelText="取消">
            <Button danger icon={<DeleteOutlined />}>销毁</Button>
          </Popconfirm>
        </Space>
      </div>

      <Row gutter={24}>
        {/* 左侧：内容沉浸展示区 */}
        <Col span={16}>
          {renderVisualizer()}
        </Col>

        {/* 右侧：元数据面板 */}
        <Col span={8}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <Title level={5} style={{ marginBottom: 24, color: '#0f172a' }}>资产元数据</Title>

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>唯一识别码 (ID)</Text>
              <Text strong style={{ fontSize: 15, fontFamily: 'monospace' }}>#{asset.id}</Text>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>归属作用域</Text>
              <Tag color={asset.project_id ? "blue" : "default"} style={{ margin: 0, fontSize: 13 }}>
                {asset.project_id ? `📦 ${projectName}` : '🌍 全局公共'}
              </Tag>
            </div>

            <Divider dashed />

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>索引标签</Text>
              {asset.tags && asset.tags.length > 0 ? (
                <Space wrap>
                  {asset.tags.map((tag: string) => <Tag key={tag} style={{ background: '#f1f5f9', border: 'none', color: '#475569' }}>{tag}</Tag>)}
                </Space>
              ) : <Text type="secondary" style={{ fontStyle: 'italic' }}>无标签</Text>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>详细描述</Text>
              <Paragraph style={{ color: '#334155', fontSize: 13, lineHeight: '1.6' }}>
                {asset.description || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>暂无描述。</span>}
              </Paragraph>
            </div>

            <Divider dashed />

            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>铸造时间</Text>
              <Text style={{ color: '#64748b', fontSize: 13 }}>
                {new Date(asset.created_at).toLocaleString()}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}