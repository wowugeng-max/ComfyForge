import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, message, Card, Row, Col, Typography, Space, Divider, Radio, Upload } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined, SaveOutlined, PictureOutlined,
  VideoCameraOutlined, FileTextOutlined,
  AppstoreAddOutlined, GlobalOutlined, InboxOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { projectApi } from '../../api/projects';
import TagsInput from '../../components/TagsInput';

const { Option } = Select;
const { Title, Text } = Typography;

export default function AssetCreate() {
  const [form] = Form.useForm();
  const [assetType, setAssetType] = useState<string>('prompt');
  const [projects, setProjects] = useState<any[]>([]);
  const [uploadedImageInfo, setUploadedImageInfo] = useState<any>(null);
  const [uploadedVideoInfo, setUploadedVideoInfo] = useState<any>(null);
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
        data = { content: values.content, negative_prompt: values.negative || '' };
      } else if (assetType === 'image') {
        if (!uploadedImageInfo) { message.warning('请先上传图片'); return; }
        data = { file_path: uploadedImageInfo.file_path, width: uploadedImageInfo.width, height: uploadedImageInfo.height, format: uploadedImageInfo.format };
      } else if (assetType === 'character') {
        data = {
          core_prompt_asset_id: values.core_prompt_asset_id,
          image_asset_ids: values.image_asset_ids?.split(',').map(Number) || [],
          lora_asset_id: values.lora_asset_id,
          variants: values.variants ? JSON.parse(values.variants) : {},
        };
      } else if (assetType === 'video') {
        if (!uploadedVideoInfo) { message.warning('请先上传视频'); return; }
        data = { file_path: uploadedVideoInfo.file_path, width: uploadedVideoInfo.width, height: uploadedVideoInfo.height, duration: uploadedVideoInfo.duration, fps: uploadedVideoInfo.fps, format: uploadedVideoInfo.format };
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
            <Form.Item label="上传图片" required>
              <Upload.Dragger
                accept="image/png,image/jpeg,image/webp,image/gif"
                showUploadList={false}
                customRequest={async ({ file, onSuccess, onError }) => {
                  const fd = new FormData();
                  fd.append('file', file as File);
                  try {
                    const res = await apiClient.post('/assets/upload/image', fd, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    const info = res.data;
                    setUploadedImageInfo(info);
                    message.success('图片上传成功');
                    onSuccess?.(info);
                  } catch {
                    message.error('图片上传失败');
                    onError?.(new Error('upload failed'));
                  }
                }}
              >
                {uploadedImageInfo ? (
                  <div style={{ padding: 8 }}>
                    <img
                      src={`/api/assets/media/${uploadedImageInfo.file_path}`}
                      alt="preview"
                      style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }}
                    />
                    <p style={{ marginTop: 8, color: '#52c41a', fontSize: 12 }}>
                      ✓ {uploadedImageInfo.width} × {uploadedImageInfo.height} · {uploadedImageInfo.format.toUpperCase()}
                    </p>
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>点击或拖拽重新上传</p>
                  </div>
                ) : (
                  <>
                    <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 40, color: '#1890ff' }} /></p>
                    <p style={{ margin: '8px 0 4px', fontWeight: 500 }}>点击或拖拽图片到此处上传</p>
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>支持 PNG / JPEG / WebP / GIF</p>
                  </>
                )}
              </Upload.Dragger>
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="宽度">
                  <Input type="number" addonAfter="px" readOnly value={uploadedImageInfo?.width} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="高度">
                  <Input type="number" addonAfter="px" readOnly value={uploadedImageInfo?.height} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="格式">
                  <Input readOnly value={uploadedImageInfo?.format} />
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
            <Form.Item label="上传视频" required>
              <Upload.Dragger
                accept="video/mp4,video/webm,video/quicktime"
                showUploadList={false}
                customRequest={async ({ file, onSuccess, onError }) => {
                  const fd = new FormData();
                  fd.append('file', file as File);
                  try {
                    const res = await apiClient.post('/assets/upload/video', fd, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    const info = res.data;
                    setUploadedVideoInfo(info);
                    message.success('视频上传成功');
                    onSuccess?.(info);
                  } catch {
                    message.error('视频上传失败');
                    onError?.(new Error('upload failed'));
                  }
                }}
              >
                {uploadedVideoInfo ? (
                  <div style={{ padding: 8 }}>
                    <VideoCameraOutlined style={{ fontSize: 40, color: '#eb2f96' }} />
                    <p style={{ marginTop: 8, color: '#52c41a', fontSize: 12 }}>
                      ✓ {uploadedVideoInfo.file_path.split('/').pop()} · {uploadedVideoInfo.format.toUpperCase()}
                    </p>
                    {uploadedVideoInfo.width > 0 && (
                      <p style={{ color: '#8c8c8c', fontSize: 12 }}>
                        {uploadedVideoInfo.width}×{uploadedVideoInfo.height} · {uploadedVideoInfo.duration}s · {uploadedVideoInfo.fps}fps
                      </p>
                    )}
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>点击或拖拽重新上传</p>
                  </div>
                ) : (
                  <>
                    <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 40, color: '#eb2f96' }} /></p>
                    <p style={{ margin: '8px 0 4px', fontWeight: 500 }}>点击或拖拽视频到此处上传</p>
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>支持 MP4 / WebM / MOV</p>
                  </>
                )}
              </Upload.Dragger>
            </Form.Item>
            <Row gutter={16}>
              <Col span={6}><Form.Item label="宽度"><Input type="number" addonAfter="px" readOnly value={uploadedVideoInfo?.width} /></Form.Item></Col>
              <Col span={6}><Form.Item label="高度"><Input type="number" addonAfter="px" readOnly value={uploadedVideoInfo?.height} /></Form.Item></Col>
              <Col span={6}><Form.Item label="时长"><Input type="number" addonAfter="s" readOnly value={uploadedVideoInfo?.duration} /></Form.Item></Col>
              <Col span={6}><Form.Item label="帧率"><Input type="number" addonAfter="fps" readOnly value={uploadedVideoInfo?.fps} /></Form.Item></Col>
            </Row>
            <Form.Item label="封装格式" style={{ marginBottom: 0 }}>
              <Input readOnly value={uploadedVideoInfo?.format} />
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
                <TagsInput />
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