import React, { useState, useEffect } from 'react';
import {
  Typography, Button, Card, Row, Col, Space, Tag, Modal,
  Form, Input, message, Popconfirm, Spin, Empty, Tooltip
} from 'antd';
import {
  PlusOutlined, ProjectOutlined, EditOutlined,
  DeleteOutlined, RocketOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { projectApi } from '../api/projects';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // 获取项目列表
  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await projectApi.getAll();
      // 按更新时间倒序排列，最近修改的排在前面
      const sorted = res.data.sort((a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setProjects(sorted);
    } catch (error) {
      message.error('无法加载创作项目列表');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // 打开新建/编辑弹窗
  const openModal = (project?: any) => {
    if (project) {
      setEditingId(project.id);
      form.setFieldsValue({
        name: project.name,
        description: project.description,
        tags: project.tags ? project.tags.join(', ') : ''
      });
    } else {
      setEditingId(null);
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload = {
        name: values.name,
        description: values.description,
        tags: values.tags ? values.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
      };

      if (editingId) {
        await projectApi.update(editingId, payload);
        message.success('项目信息已更新');
      } else {
        await projectApi.create(payload);
        message.success('🎉 新创作项目已建立！');
      }

      setIsModalOpen(false);
      fetchProjects();
    } catch (error) {
      console.log('Validation Failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // 删除项目
  const handleDelete = async (id: number) => {
    try {
      await projectApi.delete(id);
      message.success('项目已永久删除');
      fetchProjects();
    } catch (error) {
      message.error('删除失败');
    }
  };

  return (
    <div style={{ padding: '32px 48px', minHeight: '100vh', background: '#f5f7fa' }}>
      {/* 🌟 顶部大厅 Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, color: '#1f1f1f' }}>
            🏠 我的创作空间
          </Title>
          <Text type="secondary" style={{ fontSize: 16 }}>
            所有的灵感、分镜、视频，都应该被妥善安放。
          </Text>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          style={{ borderRadius: 8, height: 48, padding: '0 32px', fontSize: 16, fontWeight: 600, boxShadow: '0 4px 12px rgba(24,144,255,0.3)' }}
          onClick={() => openModal()}
        >
          新建项目
        </Button>
      </div>

      {/* 🌟 项目卡片网格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px 0' }}><Spin size="large" /></div>
      ) : projects.length === 0 ? (
        <Empty
          image="https://gw.alipayobjects.com/zos/antfincdn/ZHrcdLPrvN/empty.svg"
          imageStyle={{ height: 160 }}
          description={<Text type="secondary" style={{ fontSize: 16 }}>还没有任何项目，点击右上角创建一个吧！</Text>}
          style={{ marginTop: 80 }}
        />
      ) : (
        <Row gutter={[24, 24]}>
          {projects.map((project) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} key={project.id}>
              <Card
                hoverable
                style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8', transition: 'all 0.3s' }}
                bodyStyle={{ padding: 0 }}
                // TODO: 未来有了项目的缩略图（比如项目里生成的最后一张图片），可以在这里展示 Cover
                cover={
                  <div style={{ height: 120, background: 'linear-gradient(135deg, #e6f7ff 0%, #f9f0ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ProjectOutlined style={{ fontSize: 48, color: '#1890ff', opacity: 0.2 }} />
                  </div>
                }
                actions={[
                  <Tooltip title="编辑信息"><EditOutlined key="edit" onClick={() => openModal(project)} /></Tooltip>,
                  <Popconfirm title="警告" description="确定要删除这个项目吗？相关的资产可能会变成孤儿数据！" onConfirm={() => handleDelete(project.id)} okText="确认删除" okButtonProps={{ danger: true }}>
                    <Tooltip title="删除项目"><DeleteOutlined key="delete" style={{ color: '#ff4d4f' }} /></Tooltip>
                  </Popconfirm>
                ]}
              >
                <div style={{ padding: '20px 24px' }}>
                  {/* 项目名称与时间 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Title level={5} style={{ margin: 0, fontWeight: 600 }} ellipsis={{ tooltip: project.name }}>
                      {project.name}
                    </Title>
                  </div>

                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClockCircleOutlined style={{ fontSize: 12, color: '#bfbfbf' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(project.updated_at).toLocaleDateString()}
                    </Text>
                  </div>

                  {/* 描述与标签 */}
                  <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44, fontSize: 13, marginBottom: 12 }}>
                    {project.description || '暂无描述...'}
                  </Paragraph>

                  <div style={{ height: 26, overflow: 'hidden', marginBottom: 20 }}>
                    {project.tags?.map((tag: string) => (
                      <Tag key={tag} color="blue" bordered={false} style={{ borderRadius: 4 }}>{tag}</Tag>
                    ))}
                  </div>

                  {/* 核心入口按钮 */}
                  <Button
                    type="primary"
                    ghost
                    block
                    icon={<RocketOutlined />}
                    style={{ borderRadius: 6, fontWeight: 500 }}
                    // 🌟 预留的跳跃入口，下一步我们就去配置这个路由！
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    进入工作台
                  </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 🌟 新建/编辑项目的弹窗 */}
      <Modal
        title={editingId ? "✨ 编辑项目信息" : "✨ 创建全新创作项目"}
        open={isModalOpen}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => setIsModalOpen(false)}
        okText={editingId ? "保存修改" : "创建项目"}
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请给你的灵感起个名字！' }]}>
            <Input placeholder="例如：赛博朋克流浪猫 概念PV" size="large" />
          </Form.Item>
          <Form.Item name="description" label="项目描述 (可选)">
            <TextArea placeholder="简单描述一下这个项目的灵感来源或目标..." rows={3} />
          </Form.Item>
          <Form.Item name="tags" label="标签 (可选，用逗号分隔)">
            <Input placeholder="例如：动画, 脑洞, 预告片" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}