// src/pages/Assets/Edit.tsx
import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, message, Card, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/client';

const { Option } = Select;

const assetTypes = [
  { value: 'prompt', label: '提示词' },
  { value: 'image', label: '图像' },
  { value: 'character', label: '角色' },
  { value: 'workflow', label: '工作流' },
  { value: 'video', label: '视频' },
];

export default function AssetEdit() {
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [assetType, setAssetType] = useState<string>('prompt');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // 加载资产数据
  useEffect(() => {
    const fetchAsset = async () => {
      try {
        const res = await apiClient.get(`/assets/${id}`);
        const asset = res.data;
        setAssetType(asset.type);

        // 将资产数据转换为表单字段格式
        const formValues: any = {
          name: asset.name,
          description: asset.description || '',
          tags: asset.tags?.join(', ') || '',
          thumbnail: asset.thumbnail || '',
          project_id: asset.project_id,
          type: asset.type,
        };

        // 根据类型将 data 中的字段展开
        const data = asset.data || {};
        if (asset.type === 'prompt') {
          formValues.content = data.content || '';
          formValues.negative = data.negative || '';
        } else if (asset.type === 'image') {
          formValues.file_path = data.file_path || '';
          formValues.width = data.width;
          formValues.height = data.height;
          formValues.format = data.format || '';
        } else if (asset.type === 'character') {
          formValues.core_prompt_asset_id = data.core_prompt_asset_id;
          formValues.image_asset_ids = data.image_asset_ids?.join(', ') || '';
          formValues.lora_asset_id = data.lora_asset_id;
          formValues.variants = JSON.stringify(data.variants || {}, null, 2);
        } else if (asset.type === 'workflow') {
          formValues.workflow_json = JSON.stringify(data.workflow_json || {}, null, 2);
          formValues.parameters = JSON.stringify(data.parameters || {}, null, 2);
        } else if (asset.type === 'video') {
          formValues.file_path = data.file_path || '';
          formValues.width = data.width;
          formValues.height = data.height;
          formValues.duration = data.duration;
          formValues.fps = data.fps;
          formValues.format = data.format || '';
        }

        form.setFieldsValue(formValues);
      } catch (error) {
        message.error('加载资产失败');
        navigate('/assets');
      } finally {
        setLoading(false);
      }
    };
    fetchAsset();
  }, [id, form, navigate]);

  const onFinish = async (values: any) => {
    setSubmitting(true);
    try {
      // 根据类型构建 data 字段
      let data = {};
      if (assetType === 'prompt') {
        data = {
          content: values.content,
          negative: values.negative,
        };
      } else if (assetType === 'image') {
        data = {
          file_path: values.file_path,
          width: Number(values.width),
          height: Number(values.height),
          format: values.format,
        };
      } else if (assetType === 'character') {
        data = {
          core_prompt_asset_id: Number(values.core_prompt_asset_id),
          image_asset_ids: values.image_asset_ids?.split(',').map(Number) || [],
          lora_asset_id: values.lora_asset_id ? Number(values.lora_asset_id) : undefined,
          variants: values.variants ? JSON.parse(values.variants) : {},
        };
      } else if (assetType === 'workflow') {
        data = {
          workflow_json: values.workflow_json ? JSON.parse(values.workflow_json) : {},
          parameters: values.parameters ? JSON.parse(values.parameters) : {},
        };
      } else if (assetType === 'video') {
        data = {
          file_path: values.file_path,
          width: Number(values.width),
          height: Number(values.height),
          duration: Number(values.duration),
          fps: Number(values.fps),
          format: values.format,
        };
      }

      const payload = {
        type: assetType,
        name: values.name,
        description: values.description || '',
        tags: values.tags ? values.tags.split(',').map((t: string) => t.trim()) : [],
        data,
        thumbnail: values.thumbnail,
        project_id: values.project_id ? Number(values.project_id) : null,
      };

      await apiClient.put(`/assets/${id}`, payload);
      message.success('资产更新成功');
      navigate(`/assets/${id}`);
    } catch (error) {
      message.error('更新失败');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderFieldsByType = () => {
    switch (assetType) {
      case 'prompt':
        return (
          <>
            <Form.Item name="content" label="提示词内容" rules={[{ required: true }]}>
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="negative" label="负面提示词">
              <Input.TextArea rows={2} />
            </Form.Item>
          </>
        );
      case 'image':
        return (
          <>
            <Form.Item name="file_path" label="文件路径" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="width" label="宽度" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="height" label="高度" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="format" label="格式" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </>
        );
      case 'character':
        return (
          <>
            <Form.Item name="core_prompt_asset_id" label="核心提示词资产ID" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="image_asset_ids" label="图像资产ID（逗号分隔）">
              <Input placeholder="如 1,2,3" />
            </Form.Item>
            <Form.Item name="lora_asset_id" label="LoRA资产ID">
              <Input type="number" />
            </Form.Item>
            <Form.Item name="variants" label="变体 (JSON)">
              <Input.TextArea rows={4} placeholder='{"angry": 5, "happy": 6}' />
            </Form.Item>
          </>
        );
      case 'workflow':
        return (
          <>
            <Form.Item name="workflow_json" label="工作流 JSON" rules={[{ required: true }]}>
              <Input.TextArea rows={10} placeholder='{...}' />
            </Form.Item>
            <Form.Item name="parameters" label="参数定义 (JSON)">
              <Input.TextArea rows={6} placeholder='{"param_name": {"node_id": "1", "field": "inputs/text"}}' />
            </Form.Item>
          </>
        );
      case 'video':
        return (
          <>
            <Form.Item name="file_path" label="文件路径" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="width" label="宽度" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="height" label="高度" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="duration" label="时长(秒)" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" step="0.1" />
            </Form.Item>
            <Form.Item name="fps" label="帧率" rules={[{ required: true, type: 'number' }]}>
              <Input type="number" step="0.1" />
            </Form.Item>
            <Form.Item name="format" label="格式" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <Spin tip="加载中..." />
      </Card>
    );
  }

  return (
    <Card title="编辑资产">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ type: assetType }}
      >
        <Form.Item name="type" label="资产类型" rules={[{ required: true }]}>
          <Select disabled>
            {assetTypes.map(t => (
              <Option key={t.value} value={t.value}>{t.label}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <Input.TextArea />
        </Form.Item>

        <Form.Item name="tags" label="标签（逗号分隔）">
          <Input placeholder="如 风景, 科幻" />
        </Form.Item>

        <Form.Item name="thumbnail" label="缩略图路径">
          <Input />
        </Form.Item>

        <Form.Item name="project_id" label="项目ID">
          <Input type="number" />
        </Form.Item>

        {renderFieldsByType()}

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            保存
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate(`/assets/${id}`)}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}