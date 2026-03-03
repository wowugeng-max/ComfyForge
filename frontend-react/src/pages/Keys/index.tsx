import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Form, Input, Select, Switch, InputNumber, Typography, Tooltip, Drawer, Checkbox } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  ApiOutlined,
  SettingOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { keyApi } from '../../api/keys';
import { modelApi } from '../../api/models'; // 新增导入
import type { APIKey } from '../../types/key';

const { Option } = Select;
const { Text } = Typography;

const providerOptions = [
  { value: 'Qwen', label: 'Qwen' },
  { value: 'Gemini', label: 'Gemini' },
  { value: 'Grok', label: 'Grok' },
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'DeepSeek', label: 'DeepSeek' },
];

export default function KeyManager() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [form] = Form.useForm();

  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [syncLoading, setSyncLoading] = useState<number | null>(null);

  // ================= 抽屉与模型管理状态 =================
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentKeyForModels, setCurrentKeyForModels] = useState<APIKey | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<any | null>(null);
  const [modelForm] = Form.useForm();

  // ================= Key 基础操作 =================
  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await keyApi.getAll();
      setKeys(res.data);
    } catch (error) {
      message.error('加载 Key 列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleSyncModels = async (record: APIKey) => {
    if (!record.is_active) {
      message.warning('请先启用该 Key 后再尝试同步');
      return;
    }
    setSyncLoading(record.id);
    try {
      const res = await keyApi.syncModels(record.id);
      message.success(res.data.message || `${record.provider} 模型列表已更新`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '同步失败，请检查 API Key 权限或网络';
      message.error(errorMsg);
    } finally {
      setSyncLoading(null);
    }
  };

  const handleTest = async (id: number) => {
    setTestLoading(id);
    try {
      const res = await keyApi.test(id);
      if (res.data.valid) {
        message.success(`测试成功，剩余额度: ${res.data.quota_remaining ?? '未知'}`);
      }
      fetchKeys();
    } catch {
      message.error('测试请求失败');
    } finally {
      setTestLoading(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await keyApi.delete(id);
      message.success('删除成功');
      fetchKeys();
    } catch {
      message.error('删除失败');
    }
  };

  const openModal = (key?: APIKey) => {
    setEditingKey(key || null);
    setModalVisible(true);
    setTimeout(() => {
      if (key) {
        form.setFieldsValue({ ...key, tags: key.tags?.join(', ') });
      } else {
        form.resetFields();
      }
    }, 0);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        tags: values.tags ? values.tags.split(',').map((t: string) => t.trim()) : [],
      };

      if (editingKey) {
        await keyApi.update(editingKey.id, payload);
        message.success('更新成功');
      } else {
        await keyApi.create(payload);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchKeys();
    } catch {
      message.error('操作失败');
    }
  };

  // ================= 模型抽屉操作逻辑 =================
  const openModelDrawer = async (keyRecord: APIKey) => {
    setCurrentKeyForModels(keyRecord);
    setDrawerVisible(true);
    fetchModels(keyRecord.id);
  };

  const fetchModels = async (keyId: number) => {
    setModelsLoading(true);
    try {
      const res = await modelApi.getByKeyId(keyId);
      setModels(res.data);
    } catch (error) {
      message.error('获取模型列表失败');
    } finally {
      setModelsLoading(false);
    }
  };

  const openModelModal = (model?: any) => {
    setEditingModel(model || null);
    setModelModalVisible(true);
    setTimeout(() => {
      if (model) {
        const caps = Object.keys(model.capabilities).filter(k => model.capabilities[k]);
        modelForm.setFieldsValue({ ...model, capabilities: caps });
      } else {
        modelForm.resetFields();
        modelForm.setFieldsValue({ capabilities: ['video'] }); // 新增时默认勾选一个（例如视频）
      }
    }, 0);
  };

  const handleModelModalOk = async () => {
    try {
      const values = await modelForm.validateFields();

      const capabilitiesObj = {
        chat: values.capabilities.includes('chat'),
        vision: values.capabilities.includes('vision'),
        image: values.capabilities.includes('image'),
        video: values.capabilities.includes('video'),
      };

      const payload = {
        ...values,
        provider: currentKeyForModels?.provider, // 继承 Key 的平台
        api_key_id: currentKeyForModels?.id,
        capabilities: capabilitiesObj,
        is_manual: true,
        context_ui_params: editingModel?.context_ui_params || {}
      };

      if (editingModel) {
        await modelApi.update(editingModel.id, payload);
        message.success('模型更新成功');
      } else {
        await modelApi.create(payload);
        message.success('手动添加模型成功');
      }

      setModelModalVisible(false);
      fetchModels(currentKeyForModels!.id);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteModel = async (id: number) => {
    try {
      await modelApi.delete(id);
      message.success('模型已删除');
      fetchModels(currentKeyForModels!.id);
    } catch (error) {
      message.error('删除失败');
    }
  };

  // ================= 表格列定义 =================
  const columns: ColumnsType<APIKey> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '提供商', dataIndex: 'provider', key: 'provider', width: 100,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    { title: '备注', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (active) => <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 320,
      render: (_, record) => (
        <Space>
          <Tooltip title="管理该 Key 下的模型 (支持手动添加)">
            <Button size="small" type="primary" ghost icon={<SettingOutlined />} onClick={() => openModelDrawer(record)}>
              管理模型
            </Button>
          </Tooltip>

          <Tooltip title="编辑 Key 信息">
            <Button size="small" icon={<EditOutlined />} onClick={() => openModal(record)} />
          </Tooltip>

          {record.provider === 'Gemini' && (
            <Tooltip title="同步官方模型列表">
              <Button size="small" type="dashed" icon={<CloudSyncOutlined />} loading={syncLoading === record.id} onClick={() => handleSyncModels(record)} />
            </Tooltip>
          )}

          <Tooltip title="测试连通性">
            <Button size="small" icon={<CheckCircleOutlined />} loading={testLoading === record.id} onClick={() => handleTest(record.id)} />
          </Tooltip>

          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const modelColumns = [
    { title: '展示名称', dataIndex: 'display_name', key: 'display_name' },
    { title: '模型代号 (Name)', dataIndex: 'model_name', key: 'model_name' },
    {
      title: '能力标签', key: 'capabilities',
      render: (_: any, record: any) => (
        <Space size={[0, 4]} wrap>
          {record.capabilities?.chat && <Tag color="cyan">文本</Tag>}
          {record.capabilities?.vision && <Tag color="blue">识图</Tag>}
          {record.capabilities?.image && <Tag color="purple">绘图</Tag>}
          {record.capabilities?.video && <Tag color="magenta">视频</Tag>}
        </Space>
      ),
    },
    {
      title: '来源', key: 'source',
      render: (_: any, record: any) => (
        record.is_manual ? <Tag color="orange">手动添加</Tag> : <Tag color="green">官方同步</Tag>
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          {record.is_manual ? (
            <>
              <a onClick={() => openModelModal(record)}>编辑</a>
              <Popconfirm title="确定删除这个模型吗？" onConfirm={() => handleDeleteModel(record.id)}>
                <a style={{ color: 'red' }}>删除</a>
              </Popconfirm>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>由同步接管</Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3}><ApiOutlined /> Key 管理</Typography.Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新建 Key</Button>
          <Button icon={<ReloadOutlined />} onClick={fetchKeys}>刷新</Button>
        </Space>
      </div>

      <Table columns={columns} dataSource={keys} loading={loading} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} />

      {/* ================= Key 编辑 Modal ================= */}
      <Modal title={editingKey ? '编辑 API Key' : '添加 API Key'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="provider" label="提供商" rules={[{ required: true }]}><Select placeholder="选择 AI 供应商">{providerOptions.map(p => <Option key={p.value} value={p.value}>{p.label}</Option>)}</Select></Form.Item>
          <Form.Item name="key" label="API Key" rules={[{ required: true }]}><Input.Password placeholder="填入 API Key" /></Form.Item>
          <Form.Item name="description" label="备注"><Input /></Form.Item>
          <Form.Item name="is_active" label="启用状态" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
          <Form.Item name="quota_total" label="总配额" initialValue={0}><InputNumber style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      {/* ================= 模型管理抽屉 ================= */}
      <Drawer
        title={`${currentKeyForModels?.provider || ''} - 模型库管理`}
        width={800}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModelModal()}>手动添加模型</Button>}
      >
        <Table columns={modelColumns} dataSource={models} rowKey="id" loading={modelsLoading} pagination={false} size="small" />
      </Drawer>

      {/* ================= 手动添加/编辑模型的表单 Modal ================= */}
      <Modal title={editingModel ? '编辑手动模型' : '手动添加模型'} open={modelModalVisible} onOk={handleModelModalOk} onCancel={() => setModelModalVisible(false)} destroyOnHidden>
        <Form form={modelForm} layout="vertical">
          <Form.Item name="display_name" label="展示名称 (Display Name)" rules={[{ required: true, message: '请输入展示名称' }]}>
            <Input placeholder="例：Veo 3.1 视频生成" />
          </Form.Item>
          <Form.Item name="model_name" label="官方模型代号 (Model Name)" rules={[{ required: true, message: '必须与官方 API 要求的代号一致' }]} extra="例如：veo-3.1-generate-001">
            <Input placeholder="例：veo-3.1-generate-001" disabled={!!editingModel && !editingModel.is_manual} />
          </Form.Item>
          <Form.Item name="capabilities" label="支持的能力 (决定在哪个分类下显示)" rules={[{ required: true, message: '请至少选择一种能力' }]}>
            <Checkbox.Group options={[
              { label: '文本 (Chat)', value: 'chat' },
              { label: '识图 (Vision)', value: 'vision' },
              { label: '绘图 (Image)', value: 'image' },
              { label: '视频 (Video)', value: 'video' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}