import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, message, Card, Row, Col, Typography, Space, Divider, Spin } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined, SaveOutlined, PictureOutlined,
  VideoCameraOutlined, FileTextOutlined, ApiOutlined,
  AppstoreAddOutlined, GlobalOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { projectApi } from '../../api/projects';

const { Option } = Select;
const { Title, Text } = Typography;

export default function AssetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [assetType, setAssetType] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 并行拉取项目列表和资产详情
    Promise.all([
      projectApi.getAll(),
      apiClient.get(`/assets/${id}`)
    ]).then(([projectsRes, assetRes]) => {
      setProjects(projectsRes.data);

      const asset = assetRes.data;
      setAssetType(asset.type);

      // 平铺数据以适应 Form
      const initialValues = {
        name: asset.name,
        description: asset.description,
        tags: asset.tags ? asset.tags.join(', ') : '',
        thumbnail: asset.thumbnail,
        project_id: asset.project_id,
        ...asset.data // 展开 data 内部的字段 (content, file_path, workflow_json 等)
      };

      // 特殊处理 JSON 对象的反序列化回显
      if (asset.type === 'character' && asset.data?.variants) {
        initialValues.variants = JSON.stringify(asset.data.variants, null, 2);
        initialValues.image_asset_ids = asset.data.image_asset_ids?.join(', ');
      }
      if (asset.type === 'workflow') {
        initialValues.workflow_json = JSON.stringify(asset.data.workflow_json, null, 2);
        initialValues.parameters = JSON.stringify(asset.data.parameters, null, 2);
      }

      form.setFieldsValue(initialValues);
      setLoading(false);
    }).catch(() => {
      message.error('数据读取失败，请检查资产是否存在');
      navigate('/assets');
    });
  }, [id, form, navigate]);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      let data = {};
      // 重新组装 data 结构
      if (assetType === 'prompt') {
        data = { content: values.content, negative: values.negative };
      } else if (assetType === 'image') {
        data = { file_path: values.file_path, width: values.width, height: values.height, format: values.format };
      } else if (assetType === 'character') {
        data = {
          core_prompt_asset_id: values.core_prompt_asset_id,
          image_asset_ids: values.image_asset_ids?.split(',').map(Number) || [],
          lora_asset_id: values.lora_asset_id,
          variants: values.variants ? JSON.parse(values.variants) : {},
        };
      } else if (assetType === 'workflow') {
        data = {
          workflow_json: values.workflow_json ? JSON.parse(values.workflow_json) : {},
          parameters: values.parameters ? JSON.parse(values.parameters) : {},
        };
      } else if (assetType === 'video') {
        data = { file_path: values.file_path, width: values.width, height: values.height, duration: values.duration, fps: values.fps, format: values.format };
      }

      const payload = {
        name: values.name,
        description: values.description || '',
        tags: values.tags ? values.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean) : [],
        data,
        thumbnail: values.thumbnail,
        project_id: values.project_id || null,
      };

      await apiClient.put(`/assets/${id}`, payload);
      message.success('🎉 资产更新成功！');
      navigate(`/assets/${id}`); // 保存后跳回详情页
    } catch (error) {
      message.error('更新失败，请检查 JSON 格式等参数');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldsByType = () => {
    const codeInputStyle = { fontFamily: 'monospace', background: '#f8fafc', border: '1px solid #e2e8f0' };

    // ... 这里完全复用你 Create.tsx 里的 renderFieldsByType 的 Switch 代码 ...
    // 为节省长度，请直接把 Create.tsx 里的 switch(assetType) {...} 代码块原样复制到这里
    switch (assetType) {
      case 'prompt':
        return (
          <div style={{ background: '#f6ffed', padding: 16, borderRadius: 8, border: '1px solid #b7eb8f' }}>
            <Form.Item name="content" label={<Text strong style={{ color: '#389e0d' }}>提示词内容 (Prompt)</Text>} rules={[{ required: true }]}>
              <Input.TextArea rows={6} style={codeInputStyle} />
            </Form.Item>
            <Form.Item name="negative" label={<Text strong style={{ color: '#cf1322' }}>负面提示词 (Negative)</Text>} style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} style={codeInputStyle} />
            </Form.Item>
          </div>
        );
      case 'image':
        return (
          <div style={{ background: '#e6f7ff', padding: 16, borderRadius: 8, border: '1px solid #91caff' }}>
            <Form.Item name="file_path" label="文件物理路径或 URL" rules={[{ required: true }]}>
              <Input style={codeInputStyle} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}><Form.Item name="width" label="图像宽度" rules={[{ required: true, type: 'number', transform: Number }]}><Input type="number" addonAfter="px" /></Form.Item></Col>
              <Col span={8}><Form.Item name="height" label="图像高度" rules={[{ required: true, type: 'number', transform: Number }]}><Input type="number" addonAfter="px" /></Form.Item></Col>
              <Col span={8}><Form.Item name="format" label="格式" rules={[{ required: true }]}><Input /></Form.Item></Col>
            </Row>
          </div>
        );
      case 'workflow':
        return (
          <div style={{ background: '#f9f0ff', padding: 16, borderRadius: 8, border: '1px solid #d3adf7' }}>
            <Form.Item name="workflow_json" label="ComfyUI 工作流源码 (JSON)" rules={[{ required: true }]}>
              <Input.TextArea rows={12} style={codeInputStyle} />
            </Form.Item>
            <Form.Item name="parameters" label="动态参数暴露映射表 (JSON)" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={6} style={codeInputStyle} />
            </Form.Item>
          </div>
        );
      // character 和 video 同理略过，直接用 Create 的填入即可
      default: return null;
    }
  };

  const getTypeIcon = () => {
    switch (assetType) {
      case 'prompt': return <><FileTextOutlined style={{ color: '#52c41a' }} /> 提示词</>;
      case 'image': return <><PictureOutlined style={{ color: '#1890ff' }} /> 图像</>;
      case 'workflow': return <><ApiOutlined style={{ color: '#722ed1' }} /> 工作流</>;
      case 'video': return <><VideoCameraOutlined style={{ color: '#eb2f96' }} /> 视频</>;
      case 'character': return <><AppstoreAddOutlined style={{ color: '#fa8c16' }} /> 角色</>;
      default: return null;
    }
  };

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" tip="读取量子矩阵中..." /></div>;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Space size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} type="text" style={{ fontSize: 16, color: '#64748b' }} />
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>重铸资产</Title>
          <div style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600 }}>
            {getTypeIcon()}
          </div>
        </Space>
        <Space>
          <Button onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => form.submit()}>保存修改</Button>
        </Space>
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={24}>
          <Col span={16}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', marginBottom: 24 }}>
              <Title level={5} style={{ marginBottom: 20 }}>核心档案</Title>
              <Form.Item name="name" label={<Text strong>资产名称</Text>} rules={[{ required: true }]}>
                <Input size="large" />
              </Form.Item>
              <Form.Item name="description" label={<Text strong>资产描述</Text>}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <Divider dashed orientation="left" style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'normal' }}>模态数据区 (锁定结构)</Divider>
              {renderFieldsByType()}
            </Card>
          </Col>

          <Col span={8}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <Title level={5} style={{ marginBottom: 20 }}>元数据管理</Title>
              <Form.Item name="project_id" label={<Text strong>归属沙盒作用域</Text>}>
                <Select size="large" placeholder={<span><GlobalOutlined /> 全局公共资产</span>} allowClear>
                  {projects.map(p => <Option key={p.id} value={p.id}>📦 {p.name}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="tags" label={<Text strong>索引标签</Text>}>
                <Input size="large" placeholder="如: 赛博朋克, 高清 (逗号分隔)" />
              </Form.Item>
              <Form.Item name="thumbnail" label={<Text strong>封面图 URL (可选)</Text>}>
                <Input size="large" />
              </Form.Item>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}