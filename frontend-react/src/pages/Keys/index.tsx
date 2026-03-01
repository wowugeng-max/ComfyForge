import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Form, Input, Select, Switch, InputNumber } from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { keyApi } from '../../api/keys';
import type {APIKey, APIKeyCreate, APIKeyUpdate} from '../../types/key';

const { Option } = Select;

const providerOptions = [
  { value: 'Qwen', label: 'Qwen' },
  { value: 'Gemini', label: 'Gemini' },
  { value: 'Grok', label: 'Grok' },
  { value: 'Hailuo', label: 'Hailuo' },
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'DeepSeek', label: 'DeepSeek' },
  { value: 'Doubao', label: 'Doubao' },
  { value: 'Luma', label: 'Luma' },
];

export default function KeyManager() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [form] = Form.useForm();
  const [testLoading, setTestLoading] = useState<number | null>(null);

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

  const handleDelete = async (id: number) => {
    try {
      await keyApi.delete(id);
      message.success('删除成功');
      fetchKeys();
    } catch {
      message.error('删除失败');
    }
  };

  const handleTest = async (id: number) => {
    setTestLoading(id);
    try {
      const res = await keyApi.test(id);
      if (res.data.valid) {
        message.success(`测试成功，剩余额度: ${res.data.quota_remaining ?? '未知'}`);
      } else {
        message.error(`测试失败: ${res.data.message || '无效 Key'}`);
      }
      fetchKeys(); // 刷新以更新状态
    } catch {
      message.error('测试请求失败');
    } finally {
      setTestLoading(null);
    }
  };

  const handleTestAll = async () => {
    setLoading(true);
    try {
      await keyApi.testAll();
      message.success('批量测试完成');
      fetchKeys();
    } catch {
      message.error('批量测试失败');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (key?: APIKey) => {
    setEditingKey(key || null);
    if (key) {
      form.setFieldsValue({
        provider: key.provider,
        key: key.key,
        description: key.description,
        is_active: key.is_active,
        priority: key.priority,
        tags: key.tags?.join(', '),
        quota_total: key.quota_total,
        quota_unit: key.quota_unit,
        price_per_call: key.price_per_call,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const tags = values.tags ? values.tags.split(',').map((t: string) => t.trim()) : [];
      const payload: APIKeyCreate = {
        provider: values.provider,
        key: values.key,
        description: values.description,
        is_active: values.is_active,
        priority: values.priority,
        tags,
        quota_total: values.quota_total,
        quota_unit: values.quota_unit,
        price_per_call: values.price_per_call,
      };

      if (editingKey) {
        // 更新
        const updatePayload: APIKeyUpdate = {
          description: values.description,
          is_active: values.is_active,
          priority: values.priority,
          tags,
        };
        await keyApi.update(editingKey.id, updatePayload);
        message.success('更新成功');
      } else {
        // 创建
        await keyApi.create(payload);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchKeys();
    } catch (error) {
      message.error('操作失败，请检查表单');
    }
  };

  const columns: ColumnsType<APIKey> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
    },
    {
      title: '备注',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a, b) => a.priority - b.priority,
    },
    {
      title: '剩余配额',
      dataIndex: 'quota_remaining',
      key: 'quota_remaining',
      width: 100,
      render: (text, record) => `${text} ${record.quota_unit}`,
    },
    {
      title: '成功率',
      key: 'success_rate',
      width: 100,
      render: (_, record) => {
        const total = record.success_count + record.failure_count;
        if (total === 0) return '-';
        return `${((record.success_count / total) * 100).toFixed(1)}%`;
      },
    },
    {
      title: '平均延迟',
      dataIndex: 'avg_latency',
      key: 'avg_latency',
      width: 100,
      render: (text) => (text ? `${text.toFixed(0)}ms` : '-'),
    },
    {
      title: '最后使用',
      dataIndex: 'last_used',
      key: 'last_used',
      width: 150,
      render: (text) => (text ? new Date(text).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          >
            编辑
          </Button>
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            loading={testLoading === record.id}
            onClick={() => handleTest(record.id)}
          >
            测试
          </Button>
          <Popconfirm
            title="确定删除吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="是"
            cancelText="否"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h1>Key 管理</h1>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          新建 Key
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchKeys}>
          刷新
        </Button>
        <Button onClick={handleTestAll} loading={loading}>
          批量测试
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={keys}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1300 }}
      />

      <Modal
        title={editingKey ? '编辑 Key' : '新建 Key'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: '请选择提供商' }]}
          >
            <Select placeholder="请选择">
              {providerOptions.map(p => (
                <Option key={p.value} value={p.value}>{p.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="key"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="请输入 API Key" />
          </Form.Item>

          <Form.Item name="description" label="备注">
            <Input placeholder="备注信息" />
          </Form.Item>

          <Form.Item name="is_active" label="启用" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>

          <Form.Item
            name="priority"
            label="优先级 (0最高)"
            rules={[{ required: true, type: 'number', min: 0 }]}
            initialValue={5}
          >
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="tags" label="标签 (逗号分隔)">
            <Input placeholder="例如: free, backup" />
          </Form.Item>

          <Form.Item name="quota_total" label="总配额" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="quota_unit" label="配额单位" initialValue="count">
            <Input placeholder="例如: count, token, seconds" />
          </Form.Item>

          <Form.Item name="price_per_call" label="单次价格" initialValue={0}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}