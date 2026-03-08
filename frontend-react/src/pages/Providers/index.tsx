import React, { useEffect, useState } from 'react';
import { Table, Button, Drawer, Form, Input, Select, Switch, Space, Tag, message, Card, Typography, Tooltip, Popconfirm, Badge, Divider, Row, Col, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, GlobalOutlined, CodeOutlined, ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { providerApi, type ProviderData } from '../../api/providers';

const { Text, Title } = Typography;
const { Option } = Select;

// 🌟 新增：主流大厂预设模板
const PRESET_PROVIDERS = [
  {
    label: '阿里云 (千问)',
    color: 'orange',
    data: {
      id: 'aliyun_dashscope',
      display_name: '阿里百炼 (DashScope)',
      api_format: 'openai_compatible',
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      supported_modalities: ['text', 'vision', 'image', 'video'],
      is_active: true
    }
  },
  {
    label: '火山引擎 (豆包)',
    color: 'blue',
    data: {
      id: 'volcengine',
      display_name: '火山引擎 (豆包)',
      api_format: 'openai_compatible',
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      supported_modalities: ['text', 'vision'],
      is_active: true
    }
  },
  {
    label: '深度求索 (DeepSeek)',
    color: 'cyan',
    data: {
      id: 'deepseek',
      display_name: 'DeepSeek 官方',
      api_format: 'openai_compatible',
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://api.deepseek.com/v1',
      supported_modalities: ['text'],
      is_active: true
    }
  },
  {
    label: 'OpenAI 官方',
    color: 'green',
    data: {
      id: 'openai',
      display_name: 'OpenAI (ChatGPT)',
      api_format: 'openai_compatible',
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://api.openai.com/v1',
      supported_modalities: ['text', 'vision', 'image'],
      is_active: true
    }
  },
  {
    label: 'Google Gemini',
    color: 'purple',
    data: {
      id: 'google_gemini',
      display_name: 'Google Gemini (API)',
      api_format: 'openai_compatible', // Gemini 现在也支持 OpenAI 兼容格式
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
      supported_modalities: ['text', 'vision'],
      is_active: true
    }
  }
];

export default function ProviderManager() {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await providerApi.getAll();
      setProviders(data);
    } catch (e) {
      message.error('数据链路加载失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const onEdit = (record?: ProviderData) => {
   if (record) {
      setEditingId(record.id);
      form.setFieldsValue(record);
    } else {
      setEditingId(null);
      form.resetFields();
      // 🌟 确保这里补全了后端要求的必填项
      form.setFieldsValue({
        is_active: true,
        api_format: 'openai_compatible',
        auth_type: 'Bearer',    // 👈 必填：鉴权方式
        service_type: 'llm',    // 👈 必填：服务大类
        supported_modalities: ['text']
      });
    }
    setDrawerOpen(true);
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await providerApi.update(editingId, values);
        message.success('算力节点已重构');
      } else {
        await providerApi.create(values);
        message.success('新厂商成功注入大动脉');
      }
      setDrawerOpen(false);
      loadData();
    } catch (e: any) { message.error(e.response?.data?.detail || '操作失败'); }
  };

  const columns = [
    {
      title: '厂商与 ID',
      key: 'name',
      render: (_: any, r: ProviderData) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: '15px' }}>{r.display_name}</Text>
          <Text type="secondary" style={{ fontSize: '12px', fontFamily: 'monospace' }}>{r.id}</Text>
        </Space>
      )
    },
    {
      title: '通信底座',
      dataIndex: 'api_format',
      render: (t: string) => (
        <Tag color={t === 'openai_compatible' ? 'cyan' : 'purple'} bordered={false} style={{ padding: '2px 8px' }}>
          {t === 'openai_compatible' ? 'STANDARD' : 'NATIVE'}
        </Tag>
      )
    },
    {
      title: '算力模态',
      dataIndex: 'supported_modalities',
      render: (mods: string[]) => (
        <Space size={[0, 4]} wrap>
          {mods?.map(m => {
            const colors: any = { text: 'blue', vision: 'geekblue', image: 'magenta', video: 'volcano' };
            return <Tag key={m} bordered={false} color={colors[m] || 'default'}>{m.toUpperCase()}</Tag>;
          })}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      render: (a: boolean) => (
        <Badge status={a ? 'processing' : 'default'} text={a ? '监听中' : '已断开'} />
      )
    },
    {
      title: '操作',
      align: 'right' as const,
      render: (_: any, record: ProviderData) => (
        <Space>
          <Tooltip title="配置参数">
            <Button type="text" shape="circle" icon={<EditOutlined style={{ color: '#1890ff' }} />} onClick={() => onEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定彻底断开此厂商算力？" onConfirm={() => providerApi.delete(record.id).then(loadData)} okText="确认" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="text" shape="circle" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* 🌟 顶部极客看板区 */}
      <Row gutter={24} style={{ marginBottom: '32px' }}>
        <Col span={18}>
          <Title level={2} style={{ margin: 0, letterSpacing: '-0.5px' }}>厂商中枢 <Text type="secondary" style={{ fontWeight: 400 }}>/ Provider Matrix</Text></Title>
          <Text type="secondary">通过配置驱动协议，实现全网大模型算力的零代码动态接入与调度。</Text>
        </Col>
        <Col span={6} style={{ textAlign: 'right', alignSelf: 'center' }}>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => onEdit()}
            style={{ borderRadius: '8px', height: '48px', padding: '0 24px', fontWeight: 600, boxShadow: '0 4px 12px rgba(24,144,255,0.35)' }}
          >
            接入新算力源
          </Button>
        </Col>
      </Row>

      <Row gutter={24} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card bordered={false} style={{ borderRadius: '12px' }} bodyStyle={{ padding: '16px 24px' }}>
            <Statistic title="已就绪厂商" value={providers.length} prefix={<ApiOutlined style={{ color: '#1890ff' }} />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} style={{ borderRadius: '12px' }} bodyStyle={{ padding: '16px 24px' }}>
            <Statistic title="活跃节点" value={providers.filter(p => p.is_active).length} prefix={<ThunderboltOutlined style={{ color: '#52c41a' }} />} />
          </Card>
        </Col>
      </Row>

      {/* 🌟 主表格区 */}
      <Card bordered={false} style={{ borderRadius: '16px', boxShadow: '0 2px 16px rgba(0,0,0,0.03)' }} bodyStyle={{ padding: '0' }}>
        <Table
          dataSource={providers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          style={{ padding: '8px' }}
        />
      </Card>

      {/* 🌟 右侧属性检查器 (Drawer) */}
      <Drawer
        title={<Space><CodeOutlined /> {editingId ? "编辑算力节点" : "接入全新引擎"}</Space>}
        width={440}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        extra={<Button type="primary" onClick={onSave} icon={<CheckCircleOutlined />}>注入配置</Button>}
        headerStyle={{ borderBottom: '1px solid #f0f0f0' }}
        bodyStyle={{ padding: '24px' }}
      >
          {/* 🌟 新增：快速预设填充区 (仅在新建时显示) */}
        {!editingId && (
          <div style={{ marginBottom: 24, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              💡 一键填入主流厂商官方网关：
            </div>
            <Space size={[8, 8]} wrap>
              {PRESET_PROVIDERS.map(preset => (
                <Tag
                  key={preset.data.id}
                  color={preset.color}
                  style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}
                  onClick={() => {
                    form.setFieldsValue(preset.data);
                    message.info(`已应用 ${preset.label} 预设配置`);
                  }}
                >
                  {preset.label}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        <Form form={form} layout="vertical" requiredMark={false}>
          <Title level={5} style={{ marginBottom: 16 }}>基础身份信息</Title>
          <Form.Item name="id" label="厂商唯一标识 (ID)" rules={[{ required: true, message: '标识必填' }]}>
            <Input disabled={!!editingId} placeholder="如: volcengine, kimi" style={{ borderRadius: '6px' }} />
          </Form.Item>
          <Form.Item name="display_name" label="UI 显示名称" rules={[{ required: true, message: '名称必填' }]}>
            <Input placeholder="如: 火山引擎 (豆包)" style={{ borderRadius: '6px' }} />
          </Form.Item>

          <Divider style={{ margin: '24px 0' }} />

          <Title level={5} style={{ marginBottom: 16 }}>协议与网关</Title>
          <Form.Item name="api_format" label="通信协议规范">
            <Select style={{ width: '100%' }}>
              <Option value="openai_compatible">OpenAI 标准兼容 (V1)</Option>
              <Option value="gemini_native">Google Gemini 原生</Option>
            </Select>
          </Form.Item>
          <Form.Item name="default_base_url" label="官方 API 网关 (Base URL)">
              <Text type="secondary" style={{ fontSize: '12px' }}>
  💡 提示：自定义中转站通常需要包含路径，如 https://api.proxy.com/v1
</Text>
            <Input prefix={<GlobalOutlined />} placeholder="https://..." style={{ borderRadius: '6px' }} />
          </Form.Item>

          <Divider style={{ margin: '24px 0' }} />

          <Title level={5} style={{ marginBottom: 16 }}>模态与开关</Title>
          <Form.Item name="supported_modalities" label="支持的生成能力" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="请选择模态" style={{ width: '100%' }}>
              <Option value="text">TEXT (文本/对话)</Option>
              <Option value="vision">VISION (识图/分析)</Option>
              <Option value="image">IMAGE (绘画/生成)</Option>
              <Option value="video">VIDEO (视频生成)</Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_active" label="当前节点状态" valuePropName="checked">
            <Switch checkedChildren="已激活" unCheckedChildren="已休眠" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}