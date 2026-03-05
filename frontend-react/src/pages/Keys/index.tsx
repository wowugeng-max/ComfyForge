import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  message,
  Popconfirm,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Typography,
  Tooltip,
  Drawer,
  Checkbox,
  Spin, Radio
} from 'antd';
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
import { providerApi } from '../../api/providers'; // 🌟 1. 引入接口
import { ModelParamEditor } from '../../components/admin/ModelParamEditor';


// 🌟 2. 定义功能开关 (设为 true 所有人可见，设为 false 隐藏)
const ENABLE_ADVANCED_PARAM_EDIT = true;
const { Option } = Select;
const { Text } = Typography;

export default function KeyManager() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [dbProviders, setDbProviders] = useState<any[]>([]);
  const [form] = Form.useForm();

  // 🌟 核心魔法：实时监听表单字段的变化
  const serviceType = Form.useWatch('service_type', form);
  const provider = Form.useWatch('provider', form);

// 🌟 核心魔法：根据当前选中的大类 (LLM 还是 ComfyUI)，动态过滤数据库下发的提供商！
  const providerOptions = dbProviders
    .filter(p => p.service_type === serviceType)
    .map(p => ({ label: p.display_name, value: p.id }));

  // 2. 动态判断 Base URL 是否可编辑
  // 规则：中转站 (custom_llm) 或 任何 ComfyUI 算力都可以编辑，官方大模型置灰
  //const isBaseUrlEditable = provider === 'custom_llm' || serviceType === 'comfyui';
  // 🌟 听你的！彻底解开封印：所有类型都允许填写自定义 URL（以支持透明反代）
  const isBaseUrlEditable = true;

  // 3. 动态判断 Key 是否必填 (家里的本地 ComfyUI 通常没有密码)
  const isKeyRequired = provider !== 'local_comfyui';

  // 监听服务类型切换时，清空下方的提供商选择
  const handleServiceTypeChange = () => {
    form.setFieldsValue({ provider: undefined, base_url: undefined });
  };

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
  const [testingModel, setTestingModel] = useState<number | null>(null);

  // 🌟 新增：批量配置弹窗的状态
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [bulkCapability, setBulkCapability] = useState('image');
  const [bulkJsonStr, setBulkJsonStr] = useState('[\n  \n]');
  const [bulkSaving, setBulkSaving] = useState(false);


  // 🌟 批量保存逻辑
  const handleBulkSave = async () => {
    try {
      const parsedArray = JSON.parse(bulkJsonStr);
      if (!Array.isArray(parsedArray)) {
        return message.error('JSON 格式错误：批量下发的参数必须是一个数组 []');
      }

      setBulkSaving(true);
      const res = await modelApi.bulkUpdateUiParams({
        api_key_id: currentKeyForModels!.id,
        capability: bulkCapability,
        ui_params_array: parsedArray
      });

      message.success(res.data.message);
      setBulkModalVisible(false);
      fetchModels(currentKeyForModels!.id); // 刷新列表看结果
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        message.error('JSON 解析失败，请检查语法');
      } else {
        message.error('批量更新失败');
      }
    } finally {
      setBulkSaving(false);
    }
  };


  // 🌟 新增：处理单点测试
  const handleTestModel = async (record: any) => {
    setTestingModel(record.id);
    try {
      const res = await modelApi.test(record.id);
      if (res.data.status === 'healthy') {
        message.success(res.data.message);
      } else {
        message.warning(res.data.message);
      }
      // 测试完刷新列表以显示最新状态
      fetchModels(currentKeyForModels!.id);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '测试失败，请检查网络');
      fetchModels(currentKeyForModels!.id);
    } finally {
      setTestingModel(null);
    }
  };

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
    const fetchProviders = async () => {
      try {
        const res = await providerApi.getAll();
        setDbProviders(res.data); // 把后端下发的数据存起来
      } catch (error) {
        message.error('获取提供商列表失败');
      }
    };

    fetchProviders();
    fetchKeys(); // 这是你原本获取 Key 列表的函数
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

          {/* 只要是官方大模型 (目前限制了 gemini)，就显示同步按钮 */}
          {['gemini', 'qwen', 'doubao', 'openai'].includes(record.provider?.toLowerCase() || '') && record.service_type === 'llm' && (
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
      title: '健康状态', key: 'health_status',
      render: (_: any, record: any) => {
        const statusMap: Record<string, { color: string, text: string }> = {
          'healthy': { color: 'success', text: '可用' },
          'quota_exhausted': { color: 'error', text: '额度耗尽' },
          'unauthorized': { color: 'warning', text: '无权限' },
          'error': { color: 'default', text: '异常' },
          'unknown': { color: 'default', text: '未知' }
        };
        const s = statusMap[record.health_status] || statusMap['unknown'];
        return (
          <Tooltip title={record.last_tested_at ? `最后测试: ${new Date(record.last_tested_at).toLocaleString()}` : '尚未测试'}>
            <Tag color={s.color}>{s.text}</Tag>
          </Tooltip>
        );
      }
    },
    {
      title: '来源', key: 'source',
      render: (_: any, record: any) => (
        record.is_manual ? <Tag color="orange">手动</Tag> : <Tag color="green">同步</Tag>
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_: any, record: any) => (
        <Space size="middle">
          {/* 单点测试按钮 */}
          <a onClick={() => handleTestModel(record)}>
            {testingModel === record.id ? <Spin size="small" /> : '单点测试'}
          </a>

          {/* 🌟 核心挂载点：功能开关判断，如果开启则渲染参数配置组件 */}
          {ENABLE_ADVANCED_PARAM_EDIT && (
             <ModelParamEditor
               modelId={record.id}
               modelName={record.model_name}
               initialParams={record.context_ui_params}
               onSuccess={() => fetchModels(currentKeyForModels!.id)} // 保存成功后刷新模型列表
             />
          )}

          {/* 如果是手动模型，允许编辑基础信息和删除 */}
          {record.is_manual ? (
            <>
              <a onClick={() => openModelModal(record)}>编辑基础</a>
              <Popconfirm title="确定删除这个模型吗？" onConfirm={() => handleDeleteModel(record.id)}>
                <a style={{ color: 'red' }}>删除</a>
              </Popconfirm>
            </>
          ) : null}
        </Space>
      ),
    }
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
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            is_active: true,
            quota_total: 0,
            service_type: 'llm' // 默认选大模型
          }}
        >
          {/* 🌟 新增：服务大类选择 */}
          <Form.Item name="service_type" label="服务大类">
            <Radio.Group onChange={handleServiceTypeChange} optionType="button" buttonStyle="solid">
              <Radio value="llm">🤖 大模型 API</Radio>
              <Radio value="comfyui">🚀 ComfyUI 算力</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: '请选择提供商' }]}
          >
            <Select options={providerOptions} placeholder="请选择平台" />
          </Form.Item>

          {/* 🌟 动态 Base URL 输入框：解开 disabled 限制，优化 placeholder 提示 */}
          <Form.Item
            name="base_url"
            label="自定义网关 (Base URL)"
            // 只有中转站或 ComfyUI 时才是必填，官方大模型是选填（留空则走官方默认）
            rules={[{ required: provider === 'custom_llm' || serviceType === 'comfyui', message: '该类型必须填写网关地址' }]}
          >
            <Input
              placeholder={
                serviceType === 'comfyui'
                  ? '例如: http://127.0.0.1:8188'
                  : (provider === 'custom_llm'
                      ? '例如: https://api.proxy.com/v1 (兼容 OpenAI 格式)'
                      : '选填：透明反代地址。若直连官方请留空')
              }
            />
          </Form.Item>
          <Form.Item
            name="key"
            label="API Key / Token"
            rules={[{ required: isKeyRequired, message: '请填写 API Key' }]}
          >
            <Input.Password
              placeholder={isKeyRequired ? "填入 API Key" : "本地算力可留空"}
            />
          </Form.Item>

          <Form.Item name="description" label="备注">
            <Input placeholder="例如：家里的 5090 / 便宜的中转站" />
          </Form.Item>

          {/* ... 下面的 is_active 和 quota_total 保持你原来的写法即可 ... */}
          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="quota_total" label="总配额">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ================= 模型管理抽屉 ================= */}
<Drawer
        title={`${currentKeyForModels?.provider || ''} - 模型库管理`}
        width={850}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        extra={
          <Space>
            {/* 🌟 批量配置核武器按钮 */}
            {ENABLE_ADVANCED_PARAM_EDIT && (
              <Button
                type="dashed"
                icon={<SettingOutlined />}
                onClick={() => setBulkModalVisible(true)}
              >
                批量参数配置
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModelModal()}>手动添加模型</Button>
          </Space>
        }
      >
        <Table columns={modelColumns} dataSource={models} rowKey="id" loading={modelsLoading} pagination={false} size="small" />
      </Drawer>

      {/* 🌟 批量配置弹窗 */}
      <Modal
        title={`🚀 批量配置参数 (${currentKeyForModels?.provider || ''})`}
        open={bulkModalVisible}
        onOk={handleBulkSave}
        confirmLoading={bulkSaving}
        onCancel={() => setBulkModalVisible(false)}
        width={650}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            1. 选择要批量覆盖的能力大类：
          </Text>
          <Radio.Group value={bulkCapability} onChange={e => setBulkCapability(e.target.value)} buttonStyle="solid">
            <Radio.Button value="chat">文本 (Chat)</Radio.Button>
            <Radio.Button value="vision">识图 (Vision)</Radio.Button>
            <Radio.Button value="image">绘图 (Image)</Radio.Button>
            <Radio.Button value="video">视频 (Video)</Radio.Button>
          </Radio.Group>
        </div>

        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            2. 粘贴该大类的 JSON 参数数组 (注意：这里只需传入数组 <b>[ ... ]</b>)：
          </Text>
          <Input.TextArea
            rows={15}
            value={bulkJsonStr}
            onChange={(e) => setBulkJsonStr(e.target.value)}
            style={{ fontFamily: 'monospace', backgroundColor: '#fafafa' }}
            placeholder={`[\n  {\n    "name": "size",\n    "label": "画面比例",\n    "type": "select",\n    "options": [...]\n  }\n]`}
          />
        </div>
      </Modal>

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