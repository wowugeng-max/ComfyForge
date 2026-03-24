import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, message, Card, Row, Col, Typography, Space, Divider, Spin, Upload, Tag } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined, SaveOutlined, PictureOutlined,
  VideoCameraOutlined, FileTextOutlined, ApiOutlined,
  AppstoreAddOutlined, GlobalOutlined, InboxOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { projectApi } from '../../api/projects';
import TagsInput from '../../components/TagsInput';

const { Option } = Select;
const { Title, Text } = Typography;

export default function AssetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [assetType, setAssetType] = useState<string>('');
  const [originalData, setOriginalData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadedImageInfo, setUploadedImageInfo] = useState<any>(null);
  const [uploadedVideoInfo, setUploadedVideoInfo] = useState<any>(null);

  useEffect(() => {
    // 并行拉取项目列表和资产详情
    Promise.all([
      projectApi.getAll(),
      apiClient.get(`/assets/${id}`)
    ]).then(([projectsRes, assetRes]) => {
      setProjects(projectsRes.data);

      const asset = assetRes.data;
      setAssetType(asset.type);
      setOriginalData(asset.data);

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
        data = { content: values.content, negative_prompt: values.negative || '' };
      } else if (assetType === 'image') {
        if (uploadedImageInfo) {
          data = { file_path: uploadedImageInfo.file_path, width: uploadedImageInfo.width, height: uploadedImageInfo.height, format: uploadedImageInfo.format };
        } else {
          data = { file_path: values.file_path, width: values.width, height: values.height, format: values.format };
        }
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
        if (uploadedVideoInfo) {
          data = { file_path: uploadedVideoInfo.file_path, width: uploadedVideoInfo.width, height: uploadedVideoInfo.height, duration: uploadedVideoInfo.duration, fps: uploadedVideoInfo.fps, format: uploadedVideoInfo.format };
        } else {
          data = { file_path: values.file_path, width: values.width, height: values.height, duration: values.duration, fps: values.fps, format: values.format };
        }
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
            <Form.Item name="file_path" label="图片文件" rules={[{ required: true }]}>
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
                    form.setFieldsValue({
                      file_path: info.file_path,
                      width: info.width,
                      height: info.height,
                      format: info.format,
                    });
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
                ) : originalData?.file_path ? (
                  <div style={{ padding: 8 }}>
                    <img
                      src={originalData.file_path.startsWith('http') || originalData.file_path.startsWith('data:') ? originalData.file_path : `/api/assets/media/${originalData.file_path}`}
                      alt="current"
                      style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }}
                    />
                    <p style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>点击或拖拽新图片替换</p>
                  </div>
                ) : (
                  <>
                    <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 40, color: '#1890ff' }} /></p>
                    <p style={{ margin: '8px 0 4px', fontWeight: 500 }}>点击或拖拽新图片替换（留空保留原文件）</p>
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>支持 PNG / JPEG / WebP / GIF</p>
                  </>
                )}
              </Upload.Dragger>
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}><Form.Item name="width" label="图像宽度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
              <Col span={8}><Form.Item name="height" label="图像高度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
              <Col span={8}><Form.Item name="format" label="格式"><Input readOnly /></Form.Item></Col>
            </Row>
            {originalData?.source_model && (
              <div style={{ marginTop: 12, background: '#f0f5ff', padding: 16, borderRadius: 8, border: '1px solid #adc6ff' }}>
                <Text strong style={{ color: '#1d39c4', fontSize: 13, display: 'block', marginBottom: 12 }}>🧬 AI 生成溯源</Text>
                <Row gutter={[16, 8]}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>厂商</Text><div style={{ fontWeight: 600 }}>{originalData.source_provider || '-'}</div></Col>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>模型</Text><div style={{ fontWeight: 600 }}>{originalData.source_model}</div></Col>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>模式</Text><div style={{ fontWeight: 600 }}>{originalData.source_mode || '-'}</div></Col>
                </Row>
                {originalData.source_aspect_ratio && (
                  <Row gutter={[16, 8]} style={{ marginTop: 8 }}>
                    <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>画面比例</Text><div style={{ fontWeight: 600 }}>{originalData.source_aspect_ratio}</div></Col>
                    <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>分辨率</Text><div style={{ fontWeight: 600 }}>{originalData.source_size || '-'}</div></Col>
                  </Row>
                )}
                {originalData.source_prompt && (
                  <div style={{ marginTop: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>提示词</Text>
                    <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto', marginTop: 4 }}>{originalData.source_prompt}</div>
                  </div>
                )}
                {originalData.source_system && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>系统提示词</Text>
                    <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 80, overflow: 'auto', marginTop: 4 }}>{originalData.source_system}</div>
                  </div>
                )}
                {originalData.source_camera_params && Object.keys(originalData.source_camera_params).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>摄像机参数</Text>
                    <Row gutter={[8, 4]} style={{ marginTop: 4 }}>
                      {Object.entries(originalData.source_camera_params).map(([k, v]) => (
                        <Col key={k}><Tag color="blue" style={{ fontSize: 11 }}>{k}: {String(v)}</Tag></Col>
                      ))}
                    </Row>
                  </div>
                )}
              </div>
            )}
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
      case 'character':
        return (
          <div style={{ background: '#fff7e6', padding: 16, borderRadius: 8, border: '1px solid #ffd591' }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="core_prompt_asset_id" label="核心提示词 资产 ID" rules={[{ required: true }]}>
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
              <Input placeholder="多个 ID 请用逗号分隔" />
            </Form.Item>
            <Form.Item name="variants" label="角色变体参数 (JSON)" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={5} style={{ fontFamily: 'monospace' }} />
            </Form.Item>
          </div>
        );
      case 'video':
        return (
          <div style={{ background: '#fff0f6', padding: 16, borderRadius: 8, border: '1px solid #ffadd2' }}>
            <Form.Item name="file_path" label="视频文件" rules={[{ required: true }]}>
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
                    form.setFieldsValue({
                      file_path: info.file_path,
                      width: info.width,
                      height: info.height,
                      duration: info.duration,
                      fps: info.fps,
                      format: info.format,
                    });
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
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>点击或拖拽重新上传</p>
                  </div>
                ) : originalData?.file_path ? (
                  <div style={{ padding: 8 }}>
                    <VideoCameraOutlined style={{ fontSize: 40, color: '#eb2f96' }} />
                    <p style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
                      当前文件: {originalData.file_path.split('/').pop()}
                    </p>
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>点击或拖拽新视频替换</p>
                  </div>
                ) : (
                  <>
                    <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 40, color: '#eb2f96' }} /></p>
                    <p style={{ margin: '8px 0 4px', fontWeight: 500 }}>点击或拖拽新视频替换（留空保留原文件）</p>
                    <p style={{ color: '#8c8c8c', fontSize: 12 }}>支持 MP4 / WebM / MOV</p>
                  </>
                )}
              </Upload.Dragger>
            </Form.Item>
            <Row gutter={16}>
              <Col span={6}><Form.Item name="width" label="宽度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
              <Col span={6}><Form.Item name="height" label="高度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
              <Col span={6}><Form.Item name="duration" label="时长"><Input type="number" addonAfter="s" readOnly /></Form.Item></Col>
              <Col span={6}><Form.Item name="fps" label="帧率"><Input type="number" addonAfter="fps" readOnly /></Form.Item></Col>
            </Row>
            <Form.Item name="format" label="封装格式" style={{ marginBottom: 0 }}>
              <Input readOnly />
            </Form.Item>
          </div>
        );
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
                <TagsInput />
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