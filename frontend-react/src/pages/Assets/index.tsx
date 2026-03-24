import React, { useState, useEffect, useMemo } from 'react';
import {
  Space, Select, Button, message, Input, Segmented, Typography,
  Tag, Popconfirm, Empty, Spin, Tooltip
} from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import {
  SearchOutlined, PictureOutlined, VideoCameraOutlined,
  FileTextOutlined, ApiOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, PlusOutlined, AppstoreAddOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface Asset {
  id: number;
  type: string;
  name: string;
  description: string;
  tags: string[];
  created_at: string;
  data?: any;       // 兼容资产内容
  thumbnail?: string; // 兼容缩略图
}

export default function AssetList() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [projectId, setProjectId] = useState<number | 'global'>('global');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  // 用于控制卡片悬浮状态
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await apiClient.get('/projects/');
        setProjects(res.data);
      } catch (error) {
        console.error('加载项目失败', error);
      }
    };
    fetchProjects();
  }, []);

  // 🌟 改为响应式获取：过滤器变化时自动刷新数据，体验更现代
  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (projectId !== 'global') params.project_id = projectId;

      const res = await apiClient.get('/assets/', { params });
      setAssets(res.data);
    } catch (error) {
      message.error('加载资产失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, projectId]);

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/assets/${id}`);
      message.success('🎉 资产已销毁');
      fetchAssets();
    } catch {
      message.error('删除失败');
    }
  };

  // 客户端名称搜索过滤
  const filteredAssets = useMemo(() => {
    return assets.filter(a =>
      !searchText ||
      (a.name && a.name.toLowerCase().includes(searchText.toLowerCase())) ||
      (a.description && a.description.toLowerCase().includes(searchText.toLowerCase()))
    );
  }, [assets, searchText]);

  // 🌟 卡片图标映射
  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'image': return { icon: <PictureOutlined />, color: '#1890ff', label: '图像' };
      case 'video': return { icon: <VideoCameraOutlined />, color: '#eb2f96', label: '视频' };
      case 'prompt': return { icon: <FileTextOutlined />, color: '#52c41a', label: '提示词' };
      case 'workflow': return { icon: <ApiOutlined />, color: '#722ed1', label: '工作流' };
      case 'character': return { icon: <AppstoreAddOutlined />, color: '#fa8c16', label: '角色' };
      default: return { icon: <FileTextOutlined />, color: '#8c8c8c', label: type };
    }
  };

  // 🌟 核心：卡片预览区渲染器
  const renderCardPreview = (asset: Asset) => {
    const previewUrl = asset.thumbnail || (asset.type === 'image' && asset.data?.file_path ? `/api/assets/media/${asset.data.file_path}` : null);

    if (previewUrl) {
      return (
        <div style={{ width: '100%', height: 160, backgroundImage: `url(${previewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      );
    }

    if (asset.type === 'prompt' || asset.type === 'character') {
      return (
        <div style={{ width: '100%', height: 160, background: '#f6ffed', padding: 16, overflow: 'hidden' }}>
          <Paragraph ellipsis={{ rows: 5 }} style={{ fontSize: 12, color: '#389e0d', fontFamily: 'monospace' }}>
            {asset.description || asset.data?.content || '无文本内容...'}
          </Paragraph>
        </div>
      );
    }

    if (asset.type === 'workflow') {
      return (
        <div style={{ width: '100%', height: 160, background: '#f9f0ff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ApiOutlined style={{ fontSize: 48, color: '#b37feb', opacity: 0.5, marginBottom: 12 }} />
          <Text type="secondary" style={{ color: '#9254de' }}>参数配置模板</Text>
        </div>
      );
    }

    // 默认空状态
    return (
      <div style={{ width: '100%', height: 160, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type="secondary" style={{ fontSize: 24, opacity: 0.3 }}>{getTypeConfig(asset.type).icon}</Text>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: 24 }}>

      {/* ================= 🌟 1. 顶层过滤舱 (Filter Console) ================= */}
      <div style={{ background: '#fff', padding: '20px 24px', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Title level={4} style={{ margin: 0, color: '#0f172a' }}>全局资产大厅</Title>
            <Tag color="blue" bordered={false}>Asset Hub</Tag>
          </div>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/assets/create')} style={{ borderRadius: 6 }}>
              铸造新资产
            </Button>
            <Button type="dashed" icon={<ApiOutlined />} onClick={() => navigate('/assets/workflow-config')} style={{ borderRadius: 6 }}>
              新建工作流配置
            </Button>
          </Space>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Segmented
            options={[
              { label: '🌍 全局公共资产', value: 'global' },
              ...projects.map(p => ({ label: `📦 ${p.name}`, value: p.id }))
            ]}
            value={projectId}
            onChange={(val) => setProjectId(val as any)}
            style={{ padding: 4, background: '#f1f5f9' }}
          />

          <Segmented
            options={[
              { label: '全部', value: 'all' },
              { label: <span><PictureOutlined /> 图像</span>, value: 'image' },
              { label: <span><VideoCameraOutlined /> 视频</span>, value: 'video' },
              { label: <span><FileTextOutlined /> 提示词</span>, value: 'prompt' },
              { label: <span><ApiOutlined /> 工作流</span>, value: 'workflow' },
              { label: <span><AppstoreAddOutlined /> 角色</span>, value: 'character' },
            ]}
            value={typeFilter}
            onChange={(val) => setTypeFilter(val as string)}
            style={{ padding: 4, background: '#f1f5f9' }}
          />

          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="搜索资产名称或描述..."
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 6 }}
          />
        </div>
      </div>

      {/* ================= 🌟 2. 网格资产瀑布流 (Grid Layout) ================= */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" tip="资产加载中..." />
        </div>
      ) : filteredAssets.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 20
        }}>
          {filteredAssets.map(asset => {
            const config = getTypeConfig(asset.type);
            const isHovered = hoveredCardId === asset.id;

            // 🌟 路由映射保持与原来完全一致
            const viewPath = asset.type === 'workflow' ? `/assets/workflow-config/view/${asset.id}` : `/assets/${asset.id}`;
            const editPath = asset.type === 'workflow' ? `/assets/workflow-config/edit/${asset.id}` : `/assets/${asset.id}/edit`;

            return (
              <div
                key={asset.id}
                onMouseEnter={() => setHoveredCardId(asset.id)}
                onMouseLeave={() => setHoveredCardId(null)}
                style={{
                  background: '#fff', borderRadius: 12, overflow: 'hidden',
                  boxShadow: isHovered ? '0 12px 32px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative', border: '1px solid #f0f0f0',
                  transform: isHovered ? 'translateY(-4px)' : 'none'
                }}
              >
                {/* 媒体预览区 */}
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  {renderCardPreview(asset)}

                  {/* 🌟 沉浸式毛玻璃操作层 */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s', zIndex: 10
                  }}>
                    <Tooltip title="查看详情">
                      <Button shape="circle" icon={<EyeOutlined />} type="primary" onClick={() => navigate(viewPath)} />
                    </Tooltip>
                    <Tooltip title="编辑资产">
                      <Button shape="circle" icon={<EditOutlined />} onClick={() => navigate(editPath)} />
                    </Tooltip>
                    <Popconfirm title="确定要销毁此资产吗？" onConfirm={() => handleDelete(asset.id)} okText="销毁" cancelText="取消" placement="top">
                      <Tooltip title="销毁">
                        <Button shape="circle" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </div>

                {/* 资产信息区 */}
                <div style={{ padding: '16px 16px 20px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 15, color: '#0f172a', flex: 1 }} ellipsis title={asset.name}>
                      {asset.name || '未命名资产'}
                    </Text>
                    <Tag color={config.color} style={{ margin: 0, border: 'none', borderRadius: 4 }}>
                      {config.icon} {config.label}
                    </Tag>
                  </div>

                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }} ellipsis>
                    {asset.description || '暂无描述信息...'}
                  </Text>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 'auto' }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      ID: {asset.id}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(asset.created_at).toLocaleDateString()}
                    </Text>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #d9d9d9' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#94a3b8' }}>当前作用域下暂无资产</span>} />
        </div>
      )}
    </div>
  );
}