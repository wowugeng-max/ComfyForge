import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, message, Card, Row, Col, Typography, Space, Divider, Radio } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined, SaveOutlined, PictureOutlined,
  VideoCameraOutlined, FileTextOutlined,
  AppstoreAddOutlined, GlobalOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { projectApi } from '../../api/projects';

const { Option } = Select;
const { Title, Text } = Typography;

export default function AssetCreate() {
  const [form] = Form.useForm();
  const [assetType, setAssetType] = useState<string>('prompt');
  const [projects, setProjects] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    projectApi.getAll().then(res => {
      setProjects(res.data);
    }).catch(() => {
      message.error('无法加载项目列表');
    });
  }, []);

  const onFinish = async (values: any) => {
    try {
      let data = {};
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
      } else if (assetType === 'video') {
        data = { file_path: values.file_path, width: values.width, height: values.height, duration: values.duration, fps: values.fps, format: values.format };
      }

      const payload = {
        type: assetType,
        name: values.name,
        description: values.description || '',
        tags: values.tags ? values.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean) : [],
        data,
        thumbnail: values.thumbnail,
        project_id: values.project_id || null,
      };

      await apiClient.post('/assets/', payload);
      message.success('🎉 资产铸造成功！');
      navigate('/assets');
    } catch (error) {
      message.error('铸造失败，请检查填写内容');
    }
  };

  const renderFieldsByType = () => {
    const codeInputStyle = { fontFamily: 'monospace', background: '#f8fafc', border: '1px solid #e2e8f0' };

    switch (assetType) {
      case 'prompt':
        return (
          <div style={{ background: '#f6ffed', padding: 16, borderRadius: 8, border: '1px solid #b7eb8f' }}>
            <Form.Item name="content" label={<Text strong style={{ color: '#389e0d' }}>提示词内容 (Prompt)</Text>} rules={[{ required: true }]}>
              <Input.TextArea rows={6} style={codeInputStyle} placeholder="在此输入正向提示词..." />
            </Form.Item>
            <Form.Item name="negative" label={<Text strong style={{ color: '#cf1322' }}>负面提示词 (Negative)</Text>} style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} style={codeInputStyle} placeholder="在此输入负面提示词..." />
            </Form.Item>
          </div>
        );
      case 'image':
        return (
          <div style={{ background: '#e6f7ff', padding: 16, borderRadius: 8, border: '1px solid #91caff' }}>
            <Form.Item name="file_path" label="文件物理路径或 URL" rules={[{ required: true }]}>
              <Input style={codeInputStyle} placeholder="/data/images/xxx.png 或 http://..." />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="width" label="图像宽度" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" addonAfter="px" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="height" label="图像高度" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" addonAfter="px" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="format" label="格式" rules={[{ required: true }]}>
                  <Input placeholder="png / jpeg / webp" />
                </Form.Item>
              </Col>
            </Row>
          </div>
        );
      case 'character':
        return (
          <div style={{ background: '#fff7e6', padding: 16, borderRadius: 8, border: '1px solid #ffd591' }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="core_prompt_asset_id" label="核心提示词 资产 ID" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" prefix={<FileTextOutlined style={{ color: '#bfbfbf' }} />} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="lora_asset_id" label="LoRA 资产 ID (选填)">
                  <Input type="number" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="image_asset_ids" label="参考图像 资产 ID 矩阵">
              <Input placeholder="多个 ID 请用逗号分隔，例如: 101, 102, 105" />
            </Form.Item>
            <Form.Item name="variants" label="角色变体参数 (JSON)" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={5} style={codeInputStyle} placeholder='{&#10;  "expression_happy": "smiling broadly, bright eyes",&#10;  "outfit_battle": "wearing heavy power armor"&#10;}' />
            </Form.Item>
          </div>
        );
      case 'video':
        return (
          <div style={{ background: '#fff0f6', padding: 16, borderRadius: 8, border: '1px solid #ffadd2' }}>
            <Form.Item name="file_path" label="视频物理路径或 URL" rules={[{ required: true }]}>
              <Input style={codeInputStyle} placeholder="/data/videos/xxx.mp4" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="width" label="宽度" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" addonAfter="px" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="height" label="高度" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" addonAfter="px" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="duration" label="时长" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" step="0.1" addonAfter="s" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="fps" label="帧率" rules={[{ required: true, type: 'number', transform: (value) => Number(value) }]}>
                  <Input type="number" addonAfter="fps" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="format" label="封装格式" style={{ marginBottom: 0 }} rules={[{ required: true }]}>
              <Input placeholder="mp4 / webm" />
            </Form.Item>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Space size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')} type="text" style={{ fontSize: 16, color: '#64748b' }} />
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>铸造新资产</Title>
        </Space>
        <Space>
          <Button onClick={() => navigate('/assets')}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()}>确认铸造</Button>
        </Space>
      </div>

      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ type: 'prompt' }}>
        <Row gutter={24}>
          <Col span={16}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', marginBottom: 24 }}>
              <Title level={5} style={{ marginBottom: 20 }}>核心档案</Title>

              <Form.Item name="type" label={<Text strong>选择资产模态</Text>} rules={[{ required: true }]}>
                {/* 🌟 已彻底移除 Workflow 单选按钮 */}
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  size="large"
                  onChange={(e) => setAssetType(e.target.value)}
                  style={{ display: 'flex', gap: 8 }}
                >
                  <Radio.Button value="prompt" style={{ borderRadius: 6, flex: 1, textAlign: 'center' }}><FileTextOutlined /> 提示词</Radio.Button>
                  <Radio.Button value="image" style={{ borderRadius: 6, flex: 1, textAlign: 'center' }}><PictureOutlined /> 图像</Radio.Button>
                  <Radio.Button value="character" style={{ borderRadius: 6, flex: 1, textAlign: 'center' }}><AppstoreAddOutlined /> 角色</Radio.Button>
                  <Radio.Button value="video" style={{ borderRadius: 6, flex: 1, textAlign: 'center' }}><VideoCameraOutlined /> 视频</Radio.Button>
                </Radio.Group>
              </Form.Item>

              <Form.Item name="name" label={<Text strong>资产名称</Text>} rules={[{ required: true }]}>
                <Input size="large" placeholder="给这个资产起个响亮的名字..." />
              </Form.Item>

              <Form.Item name="description" label={<Text strong>资产描述</Text>}>
                <Input.TextArea rows={3} placeholder="简要描述该资产的用途、特点或注意事项..." />
              </Form.Item>

              <Divider dashed orientation="left" style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'normal' }}>具体模态配置区</Divider>
              {renderFieldsByType()}
            </Card>
          </Col>

          <Col span={8}>
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <Title level={5} style={{ marginBottom: 20 }}>元数据管理</Title>

              <Form.Item
                name="project_id"
                label={<Text strong>归属沙盒作用域</Text>}
                tooltip="留空则意味着这是一个全局公共资产，任何项目都可以调用。"
              >
                <Select
                  size="large"
                  placeholder={<span><GlobalOutlined /> 设为全局公共资产</span>}
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  style={{ width: '100%' }}
                >
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>📦 {p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="tags" label={<Text strong>索引标签</Text>}>
                <Input size="large" placeholder="如: 赛博朋克, 高清 (逗号分隔)" />
              </Form.Item>

              <Form.Item name="thumbnail" label={<Text strong>封面图 URL (可选)</Text>} tooltip="用于在资产大厅中展示的预览小图。">
                <Input size="large" placeholder="http://..." />
              </Form.Item>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}