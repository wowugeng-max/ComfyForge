import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, Switch, InputNumber, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiClient from '../../api/client';
import { ruleApi } from '../../api/rules';
import type {RecommendationRule, RuleCreate} from '../../types/rule';

// 合并后的规则类型（包含手动和学习）
interface CombinedRule {
  id?: number;
  class_type: string;
  field: string;
  friendly_name: string;
  auto_check: boolean;
  enabled: boolean;
  priority: number;
  threshold: number;
  source: 'manual' | 'learned';
  count?: number;
  created_at?: string;
  updated_at?: string;
}

export default function RulesPage() {
  const [rules, setRules] = useState<CombinedRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<RecommendationRule | null>(null);
  const [form] = Form.useForm();

  // 获取合并后的规则列表
  const fetchRules = async () => {
    setLoading(true);
    try {
      // 使用后端合并接口
      const res = await apiClient.get<CombinedRule[]>('/recommendation-rules/combined');
      setRules(res.data);
    } catch (error) {
      message.error('加载规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  // 打开手动规则编辑/新建弹窗
  const openManualModal = (rule?: RecommendationRule) => {
    setEditingRule(rule || null);
    if (rule) {
      form.setFieldsValue(rule);
    } else {
      form.resetFields();
      form.setFieldsValue({
        auto_check: false,
        enabled: true,
        priority: 0,
        threshold: 1,
      });
    }
    setModalVisible(true);
  };

  // 保存手动规则
  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingRule) {
        await ruleApi.update(editingRule.id, values);
        message.success('更新成功');
      } else {
        await ruleApi.create(values as RuleCreate);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchRules();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 删除手动规则
  const handleDelete = async (id: number) => {
    try {
      await ruleApi.delete(id);
      message.success('删除成功');
      fetchRules();
    } catch {
      message.error('删除失败');
    }
  };

  // 将学习规则添加为手动规则
  const handleAddManualFromLearned = async (item: CombinedRule) => {
    try {
      await ruleApi.create({
        class_type: item.class_type,
        field: item.field,
        friendly_name: item.friendly_name,
        auto_check: true,
        enabled: true,
        priority: 0,
        threshold: 1,
      });
      message.success('已添加为手动规则');
      fetchRules(); // 重新加载以更新列表
    } catch {
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<CombinedRule> = [
    {
      title: '来源',
      dataIndex: 'source',
      width: 80,
      render: (src: string) => (
        <Tag color={src === 'manual' ? 'blue' : 'green'}>
          {src === 'manual' ? '手动' : '学习'}
        </Tag>
      ),
    },
    { title: 'ID', dataIndex: 'id', width: 60, render: (id) => id || '-' },
    { title: '节点类型', dataIndex: 'class_type', width: 200 },
    { title: '字段', dataIndex: 'field', width: 100 },
    { title: '默认参数名', dataIndex: 'friendly_name', width: 150 },
    {
      title: '默认勾选',
      dataIndex: 'auto_check',
      render: (val) => (val ? '是' : '否'),
      width: 80,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      render: (val, record) => (record.source === 'learned' ? '-' : (val ? '是' : '否')),
      width: 60,
    },
    { title: '优先级', dataIndex: 'priority', sorter: true, width: 80 },
    { title: '阈值', dataIndex: 'threshold', width: 80 },
    {
      title: '统计次数',
      dataIndex: 'count',
      render: (count) => count ?? '-',
      width: 80,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => {
        if (record.source === 'manual') {
          return (
            <Space>
              <Button type="text" icon={<EditOutlined />} onClick={() => openManualModal(record as RecommendationRule)} />
              <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id!)}>
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          );
        } else {
          // 学习规则：提供“添加为规则”按钮
          return (
            <Button type="link" onClick={() => handleAddManualFromLearned(record)}>
              添加为规则
            </Button>
          );
        }
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>推荐规则管理</h1>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => openManualModal()}
        style={{ marginBottom: 16 }}
      >
        新建手动规则
      </Button>
      <Table
        columns={columns}
        dataSource={rules}
        loading={loading}
        rowKey={(record) => record.source === 'manual' ? `manual-${record.id}` : `learned-${record.class_type}-${record.field}`}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1300 }}
      />

      {/* 手动规则编辑/新建弹窗 */}
      <Modal
        title={editingRule ? '编辑手动规则' : '新建手动规则'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="class_type" label="节点类型" rules={[{ required: true }]}>
            <Input placeholder="例如: CLIPTextEncode" />
          </Form.Item>
          <Form.Item name="field" label="字段名" rules={[{ required: true }]}>
            <Input placeholder="例如: text" />
          </Form.Item>
          <Form.Item name="friendly_name" label="默认参数名" rules={[{ required: true }]}>
            <Input placeholder="例如: 提示词" />
          </Form.Item>
          <Form.Item name="auto_check" label="默认勾选" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item name="priority" label="优先级 (越小越靠前)" rules={[{ required: true, type: 'number' }]}>
            <InputNumber min={-100} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="threshold" label="推荐阈值 (统计次数达到此值才自动勾选)" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}