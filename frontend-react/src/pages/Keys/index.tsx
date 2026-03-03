import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Form, Input, Select, Switch, InputNumber, Typography, Tooltip } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  ApiOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { keyApi } from '../../api/keys'; // 确保 keyApi 已包含 syncModels 方法
import type { APIKey, APIKeyCreate, APIKeyUpdate } from '../../types/key';

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

  // 状态管理：记录正在测试或同步的 Key ID
  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [syncLoading, setSyncLoading] = useState<number | null>(null);

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

  // --- 新增：按 Key ID 同步模型逻辑 [cite: 2026-03-03] ---
  const handleSyncModels = async (record: APIKey) => {
    if (!record.is_active) {
      message.warning('请先启用该 Key 后再尝试同步');
      return;
    }
    setSyncLoading(record.id);
    try {
      // 核心：传递 record.id 而非 provider 字符串，实现 Key-模型 绑定 [cite: 2026-03-03]
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
    if (key) {
      form.setFieldsValue({
        ...key,
        tags: key.tags?.join(', '),
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
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

  const columns: ColumnsType<APIKey> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    { title: '备注', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active) => <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space>
          <Tooltip title="编辑信息">
            <Button size="small" icon={<EditOutlined />} onClick={() => openModal(record)} />
          </Tooltip>

          {/* 同步模型按钮：仅支持 Gemini 等已对接平台 [cite: 2026-03-03] */}
          {record.provider === 'Gemini' && (
            <Tooltip title="同步此 Key 拥有的模型列表">
              <Button
                size="small"
                type="dashed"
                icon={<CloudSyncOutlined />}
                loading={syncLoading === record.id}
                onClick={() => handleSyncModels(record)}
              >
                同步
              </Button>
            </Tooltip>
          )}

          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            loading={testLoading === record.id}
            onClick={() => handleTest(record.id)}
          >
            测试
          </Button>

          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
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

      <Table
        columns={columns}
        dataSource={keys}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingKey ? '编辑 API Key' : '添加 API Key'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="provider" label="提供商" rules={[{ required: true }]}>
            <Select placeholder="选择 AI 供应商">
              {providerOptions.map(p => <Option key={p.value} value={p.value}>{p.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="key" label="API Key" rules={[{ required: true }]}>
            <Input.Password placeholder="填入 API Key" />
          </Form.Item>
          <Form.Item name="description" label="备注"><Input /></Form.Item>
          <Form.Item name="is_active" label="启用状态" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Form.Item name="quota_total" label="总配额" initialValue={0}><InputNumber style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}