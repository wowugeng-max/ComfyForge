// frontend-react/src/pages/Providers/index.tsx
import React, { useEffect, useState } from 'react';
import { Table, Button, Drawer, Form, Input, Select, Switch, Space, Tag, message, Card, Typography, Tooltip, Popconfirm, Badge, Divider, Row, Col, Statistic, Collapse } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, GlobalOutlined, CodeOutlined, ThunderboltOutlined, CheckCircleOutlined, MinusCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { providerApi, type ProviderData } from '../../api/providers';

const { Text, Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// 🌟 终极预设库：所有大厂均严格对齐 6 大模态与可视化路由
// 🌟 升级：全配置驱动的大厂预设（实现端点级 Header 隔离）
const PRESET_PROVIDERS = [
 {
    label: '阿里云 (千问/万相)',
    color: 'orange',
    data: {
      id: 'aliyun_dashscope',
      display_name: '阿里百炼 (DashScope)',
      api_format: 'openai_compatible',
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      supported_modalities: ['chat', 'vision', 'text_to_image', 'image_to_image', 'text_to_video', 'image_to_video'],
      is_active: true,
      endpoints: {
        chat: "/chat/completions",
        vision: "/chat/completions",
        text_to_image: {
          "url": "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
          "payload_template": {
            "model": "{{model}}",
            "input": {
              "messages": [
                {
                  "role": "user",
                  "content": [
                    { "text": "{{prompt}}" }
                  ]
                }
              ]
            },
            "parameters": {
              "size": "{{size}}",
              "prompt_extend": false
            }
          },
          "result_extractor": "output.choices.0.message.content.0.image"
          // 💡 注意：这里没有 async header，保证了纯同步请求的成功！
        },
        image_to_image: {
          "url": "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
          "poll_url": "https://dashscope.aliyuncs.com/api/v1/tasks/{{task_id}}",
          "headers": { "X-DashScope-Async": "enable" }, // 💡 仅向需要的接口注入异步头
          "payload_template": {
            "model": "{{model}}",
            "input": { "prompt": "{{prompt}}", "ref_img": "{{image_url}}" },
            "parameters": { "size": "{{size}}" }
          },
          "task_id_extractor": "output.task_id",
          "status_extractor": "output.task_status",
          "result_extractor": "output.results.0.url"
        },
        text_to_video: {
          "url": "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
          "poll_url": "https://dashscope.aliyuncs.com/api/v1/tasks/{{task_id}}",
          "headers": { "X-DashScope-Async": "enable" },
          "payload_template": {
            "model": "{{model}}",
            "input": { "prompt": "{{prompt}}" }
          },
          "task_id_extractor": "output.task_id"
        },
        image_to_video: {
          "url": "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
          "poll_url": "https://dashscope.aliyuncs.com/api/v1/tasks/{{task_id}}",
          "headers": { "X-DashScope-Async": "enable" },
          "payload_template": {
            "model": "{{model}}",
            "input": { "prompt": "{{prompt}}", "img_url": "{{image_url}}" }
          },
          "task_id_extractor": "output.task_id"
        }
      },
      custom_headers: {} // 💡 清空全局 Header，避免污染
    }
  },
  // ... 其他预设保持不变 ...
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
      supported_modalities: ['chat', 'vision'],
      is_active: true,
      endpoints: {
        chat: "/chat/completions",
        vision: "/chat/completions"
      }
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
      supported_modalities: ['chat'],
      is_active: true,
      endpoints: {
        chat: "/chat/completions"
      }
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
      supported_modalities: ['chat', 'vision', 'text_to_image', 'image_to_image'],
      is_active: true,
      endpoints: {
        chat: "/chat/completions",
        vision: "/chat/completions",
        text_to_image: "/images/generations",
        image_to_image: "/images/generations"
      }
    }
  },
  {
    label: 'Google Gemini',
    color: 'purple',
    data: {
      id: 'google_gemini',
      display_name: 'Google Gemini (API)',
      api_format: 'openai_compatible',
      auth_type: 'Bearer',
      service_type: 'llm',
      default_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
      supported_modalities: ['chat', 'vision'],
      is_active: true,
      endpoints: {
        chat: "/chat/completions",
        vision: "/chat/completions"
      }
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

      const headersObj = record.custom_headers || {};
      const headersList = Object.entries(headersObj).map(([key, value]) => ({ key, value }));

      const formattedEndpoints: Record<string, string> = {};
      if (record.endpoints) {
        Object.entries(record.endpoints).forEach(([key, val]) => {
          formattedEndpoints[key] = typeof val === 'object' ? JSON.stringify(val, null, 2) : val;
        });
      }

      form.setFieldsValue({
        ...record,
        custom_headers_list: headersList,
        endpoints: formattedEndpoints
      });
    } else {
      setEditingId(null);
      form.resetFields();
      form.setFieldsValue({
        is_active: true,
        api_format: 'openai_compatible',
        auth_type: 'Bearer',
        service_type: 'llm',
        supported_modalities: ['chat'],
        custom_headers_list: [],
        endpoints: {}
      });
    }
    setDrawerOpen(true);
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();

      const headersObj: Record<string, string> = {};
      if (values.custom_headers_list) {
        values.custom_headers_list.forEach((item: any) => {
          if (item && item.key && item.value) {
            headersObj[item.key] = item.value;
          }
        });
      }

      const parsedEndpoints: Record<string, any> = {};
      if (values.endpoints) {
        for (const [key, val] of Object.entries(values.endpoints)) {
          const strVal = String(val).trim();
          if (!strVal) continue;

          if (strVal.startsWith('{')) {
            try {
              parsedEndpoints[key] = JSON.parse(strVal);
            } catch (e) {
              message.error(`[${key}] 路由的 JSON 格式错误，请检查大括号和引号！`);
              return;
            }
          } else {
             parsedEndpoints[key] = strVal;
          }
        }
      }

      const payload = {
        ...values,
        custom_headers: headersObj,
        endpoints: parsedEndpoints
      };

      delete payload.custom_headers_list;

      if (editingId) {
        await providerApi.update(editingId, payload);
        message.success('算力节点已重构');
      } else {
        await providerApi.create(payload);
        message.success('新厂商成功注入大动脉');
      }
      setDrawerOpen(false);
      loadData();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.detail || '操作失败');
    }
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
            const colors: any = {
              chat: 'blue',
              vision: 'geekblue',
              text_to_image: 'magenta',
              image_to_image: 'purple',
              text_to_video: 'volcano',
              image_to_video: 'red'
            };
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
      <Row gutter={24} style={{ marginBottom: '32px' }}>
        <Col span={18}>
          <Title level={2} style={{ margin: 0, letterSpacing: '-0.5px' }}>厂商中枢 <Text type="secondary" style={{ fontWeight: 400 }}>/ Provider Matrix</Text></Title>
          <Text type="secondary">通过 DSL 模板驱动协议，实现全网大模型算力的零代码动态接入与调度。</Text>
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

      <Drawer
        title={<Space><CodeOutlined /> {editingId ? "编辑算力节点" : "接入全新引擎"}</Space>}
        width={650}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        extra={<Button type="primary" onClick={onSave} icon={<CheckCircleOutlined />}>注入配置</Button>}
        headerStyle={{ borderBottom: '1px solid #f0f0f0' }}
        bodyStyle={{ padding: '24px' }}
      >
        {!editingId && (
          <div style={{ marginBottom: 24, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              💡 一键填入主流厂商官方网关与 DSL 模板：
            </div>
            <Space size={[8, 8]} wrap>
              {PRESET_PROVIDERS.map(preset => (
                <Tag
                  key={preset.data.id}
                  color={preset.color}
                  style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}
                  onClick={() => {
                    // 🌟 修复：完整的数据映射，确保所有预设都能正确填入表单
                    const presetData = { ...preset.data };

                    const headersList = Object.entries(presetData.custom_headers || {}).map(([key, value]) => ({ key, value }));

                    const formattedEndpoints: Record<string, string> = {};
                    if (presetData.endpoints) {
                      Object.entries(presetData.endpoints).forEach(([key, val]) => {
                        formattedEndpoints[key] = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
                      });
                    }

                    form.setFieldsValue({
                      ...presetData, // 这包含了 id, display_name, api_format, auth_type, service_type, default_base_url, supported_modalities, is_active
                      custom_headers_list: headersList,
                      endpoints: formattedEndpoints
                    });
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

          <Title level={5} style={{ marginBottom: 16 }}>协议与全局网关</Title>
          <Form.Item name="api_format" label="通信协议规范">
            <Select style={{ width: '100%' }}>
              <Option value="openai_compatible">OpenAI 标准兼容 (V1)</Option>
              <Option value="gemini_native">Google Gemini 原生</Option>
            </Select>
          </Form.Item>
          <Form.Item name="default_base_url" label="官方 API 网关 (Base URL)">
            <Text type="secondary" style={{ fontSize: '12px' }}>
              💡 提示：所有未配置高级路由的请求，默认拼接此地址。
            </Text>
            <Input prefix={<GlobalOutlined />} placeholder="https://..." style={{ borderRadius: '6px' }} />
          </Form.Item>

          <Divider style={{ margin: '24px 0' }} />
          <Title level={5} style={{ marginBottom: 16 }}>模态与开关</Title>
          <Form.Item name="supported_modalities" label="支持的生成能力" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="请选择模态" style={{ width: '100%' }}>
              <Option value="chat">CHAT (文本对话)</Option>
              <Option value="vision">VISION (视觉理解)</Option>
              <Option value="text_to_image">T2I (纯文生图)</Option>
              <Option value="image_to_image">I2I (图生图)</Option>
              <Option value="text_to_video">T2V (纯文生视频)</Option>
              <Option value="image_to_video">I2V (图生视频)</Option>
            </Select>
          </Form.Item>

          <Collapse ghost expandIconPosition="end" style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: 24, padding: '4px 0' }}>
            <Collapse.Panel
              header={<Space><SettingOutlined style={{ color: '#64748b' }} /><Text strong style={{ color: '#334155' }}>高级路由覆盖与 DSL 映射模板</Text></Space>}
              key="1"
            >
              <div style={{ marginBottom: 24 }}>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>模态级方言映射 (DSL Overrides)</Text>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>支持直接填入 URL 或填入完整的 JSON DSL 映射模板以支持原生 API 渲染。</div>
                <Form.Item name={['endpoints', 'chat']} label="对话端点 (chat)">
                  <TextArea rows={2} placeholder="/chat/completions" style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#fff' }} />
                </Form.Item>
                <Form.Item name={['endpoints', 'vision']} label="视觉端点 (vision)">
                  <TextArea rows={2} placeholder="/chat/completions" style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#fff' }} />
                </Form.Item>
                <Form.Item name={['endpoints', 'text_to_image']} label="文生图端点 (text_to_image)">
                  <TextArea rows={6} placeholder={`{\n  "url": "...",\n  "payload_template": {...}\n}`} style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#fff' }} />
                </Form.Item>
                <Form.Item name={['endpoints', 'image_to_image']} label="图生图端点 (image_to_image)">
                  <TextArea rows={6} placeholder={`{\n  "url": "...",\n  "payload_template": {...}\n}`} style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#fff' }} />
                </Form.Item>
                <Form.Item name={['endpoints', 'text_to_video']} label="文生视频端点 (text_to_video)">
                  <TextArea rows={6} placeholder={`{\n  "url": "...",\n  "payload_template": {...}\n}`} style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#fff' }} />
                </Form.Item>
                <Form.Item name={['endpoints', 'image_to_video']} label="图生视频端点 (image_to_video)">
                  <TextArea rows={6} placeholder={`{\n  "url": "...",\n  "payload_template": {...}\n}`} style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#fff' }} />
                </Form.Item>
              </div>

              <div>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>自定义请求头 (Custom Headers)</Text>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>强制附加在每次请求中的特殊鉴权或参数标识。</div>
                <Form.List name="custom_headers_list">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name, ...restField }) => (
                        <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                          <Form.Item
                            {...restField}
                            name={[name, 'key']}
                            rules={[{ required: true, message: '缺失 Key' }]}
                          >
                            <Input placeholder="Header Key" style={{ width: 140 }} />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'value']}
                            rules={[{ required: true, message: '缺失 Value' }]}
                          >
                            <Input placeholder="Header Value" style={{ width: 220 }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 16 }} />
                        </Space>
                      ))}
                      <Form.Item style={{ marginTop: 12 }}>
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          新增一条 Header 规则
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </div>
            </Collapse.Panel>
          </Collapse>

          <Form.Item name="is_active" label="当前节点状态" valuePropName="checked" style={{ marginTop: 24 }}>
            <Switch checkedChildren="已激活" unCheckedChildren="已休眠" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}