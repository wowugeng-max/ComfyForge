import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
// 🌟 1. 引入项目 API
import { projectApi } from '../../api/projects';

const { Option } = Select;

const assetTypes = [
  { value: 'prompt', label: '提示词' },
  { value: 'image', label: '图像' },
  { value: 'character', label: '角色' },
  { value: 'workflow', label: '工作流' },
  { value: 'video', label: '视频' },
];

export default function AssetCreate() {
  const [form] = Form.useForm();
  const [assetType, setAssetType] = useState<string>('prompt');

  // 🌟 2. 新增状态：保存项目列表
  const [projects, setProjects] = useState<any[]>([]);
  const navigate = useNavigate();

  // 🌟 3. 在组件挂载时拉取所有项目
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
      } else if (assetType === 'workflow') {
        data = {
          workflow_json: values.workflow_json ? JSON.parse(values.workflow_json) : {},
          parameters: values.parameters ? JSON.parse(values.parameters) : {},
        };
      } else if (assetType === 'video') {
        data = { file_path: values.file_path, width: values.width, height: values.height, duration: values.duration, fps: values.fps, format: values.format };
      }

      const payload = {
        type: assetType,
        name: values.name,
        description: values.description || '',
        tags: values.tags ? values.tags.split(',').map((t: string) => t.trim()) : [],
        data,
        thumbnail: values.thumbnail,
        // 🌟 4. 如果没选项目，传 null 就是全局资产
        project_id: values.project_id || null,
      };

      await apiClient.post('/assets/', payload);
      message.success('资产创建成功');
      navigate('/assets');
    } catch (error) {
      message.error('创建失败');
    }
  };

  const renderFieldsByType = () => {
    // ... 这里的 switch 代码保持完全不变 ...
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

  return (
    <Card title="新建资产">
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ type: 'prompt' }}>
        <Form.Item name="type" label="资产类型" rules={[{ required: true }]}>
          <Select onChange={(value) => setAssetType(value)}>
            {assetTypes.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
          </Select>
        </Form.Item>

        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        {/* 🌟 5. 将生硬的 Input 替换为优雅的 Select 下拉框 */}
        <Form.Item
          name="project_id"
          label="归属项目 (留空则为全局资产)"
          tooltip="选择此项后，该资产将只会出现在该项目的画布资产库中。"
        >
          <Select
            placeholder="🌍 设为全局公共资产"
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {projects.map(p => (
              <Option key={p.id} value={p.id}>📦 {p.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="description" label="描述"><Input.TextArea /></Form.Item>
        <Form.Item name="tags" label="标签（逗号分隔）"><Input placeholder="如 风景, 科幻" /></Form.Item>
        <Form.Item name="thumbnail" label="缩略图路径"><Input /></Form.Item>

        {renderFieldsByType()}

        <Form.Item>
          <Button type="primary" htmlType="submit">创建</Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/assets')}>取消</Button>
        </Form.Item>
      </Form>
    </Card>
  );
}