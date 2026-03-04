// src/components/Nodes/ComfyUIEngineNode.tsx
import React, { useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { Select, Input, Button, Card, message, Typography, Space } from 'antd';
import { PlayCircleOutlined, ApiOutlined, CloudServerOutlined } from '@ant-design/icons';
import { providerApi } from '../../api/providers';
import { keyApi } from '../../api/keys';
import apiClient from '../../api/client';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { useDrop } from 'react-dnd';
import { DndItemTypes } from '../../constants/dnd'; // 确保路径正确

const { Text } = Typography;
const { TextArea } = Input;

export default function ComfyUIEngineNode({ data, id }: any) {
  const [providers, setProviders] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const [workflowJson, setWorkflowJson] = useState<string>(data.workflowJson || '');

  const [isRunning, setIsRunning] = useState(false);
  const [resultImage, setResultImage] = useState<any>(null); // 存放输出结果

  // 🌟 核心魔法：让当前节点变成一个可以接收拖拽的靶子！
  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: any) => {
      const asset = item.asset;
      // 🌟 关键修复：允许接收类型为 workflow 的资产
      if (asset && (asset.type === 'workflow' || asset.type === 'prompt')) {

        // 根据你后端的结构，如果是 JSON 字符串，可能存在 asset.data 里面，或者直接就是 asset.content
        // 如果拖进来的是 "[object Object]" 这种错误格式，你可以用 JSON.stringify 兜底转换一下：
        let jsonContent = '';
        const rawContent = asset.data?.content || asset.content || asset.data || '';

        if (typeof rawContent === 'object') {
             jsonContent = JSON.stringify(rawContent, null, 2);
        } else {
             jsonContent = String(rawContent);
        }

        setWorkflowJson(jsonContent);
        message.success(`成功加载工作流: ${asset.name}`);
      } else {
        message.warning('格式不对哦，请拖入“工作流 (workflow)”类型的资产');
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  // 加载基础数据
  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const [provRes, keyRes] = await Promise.all([
          providerApi.getAll('comfyui'), // 🌟 只拉取算力引擎
          keyApi.getAll()
        ]);
        setProviders(provRes.data);
        setKeys(keyRes.data);
      } catch (error) {
        message.error('加载节点配置失败');
      }
    };
    fetchInitData();
  }, []);

  // 动态过滤 Key
  const availableKeys = keys.filter(
    k => k.provider.toLowerCase() === selectedProvider?.toLowerCase() && k.is_active
  );

  const handleRun = async () => {
    if (!selectedProvider || !selectedKeyId) return message.warning('请选择算力平台和凭证');
    if (!workflowJson.trim()) return message.warning('请输入 Workflow JSON');

    try { JSON.parse(workflowJson); } catch (e) { return message.error('JSON 格式不正确'); }

    setIsRunning(true);
    setResultImage(null);

    try {
      // 🌟 发送标准请求给大一统路由
      const res = await apiClient.post('/generate', {
        api_key_id: selectedKeyId,
        provider: selectedProvider,
        model: 'comfyui-workflow',
        type: 'image',
        prompt: workflowJson,
        params: { provider: selectedProvider } // 传给后端辅助判断
      });

      message.success('渲染成功！');
      console.log('引擎完整输出:', res.data.content);

      // 这里的具体解析视你工作流里用的 Save 节点而定
      // 暂时把原始数据存下来，你可以在控制台查看结构，方便下一步提取图片 URL
      setResultImage(JSON.stringify(res.data.content, null, 2));

    } catch (error: any) {
      message.error(error.response?.data?.detail || '渲染执行失败');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card
        ref={drop} // 🌟 关键：把 drop 挂载到这里
      size="small"
      title={<><CloudServerOutlined /> 算力引擎</>}
      style={{ width: 350, borderRadius: 12,// 🌟 添加交互反馈：如果有东西拖到上面，边框变成蓝色虚线
        border: isOver ? '2px dashed #1890ff' : '1px solid #f0f0f0',
        backgroundColor: isOver ? '#e6f7ff' : '#fff',
        transition: 'all 0.3s' }}
    >
      <Handle type="target" position={Position.Left} id="in" />

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>算力提供商</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择本地节点或云算力"
            options={providers.map(p => ({ label: p.display_name, value: p.id }))}
            value={selectedProvider}
            onChange={(val) => { setSelectedProvider(val); setSelectedKeyId(null); }}
          />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>执行凭证 (API Key)</Text>
          <Select
            style={{ width: '100%' }}
            placeholder={selectedProvider ? "选择凭证" : "请先选择平台"}
            options={availableKeys.map(k => ({ label: `${k.description || '凭证'} (ID:${k.id})`, value: k.id }))}
            value={selectedKeyId}
            onChange={setSelectedKeyId}
            disabled={!selectedProvider}
          />
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}><ApiOutlined /> Workflow JSON (API)</Text>
          <TextArea
            rows={5}
            placeholder="粘贴从 ComfyUI 导出的 API JSON..."
            value={workflowJson}
            onChange={(e) => setWorkflowJson(e.target.value)}
          />
        </div>

        <Button type="primary" block icon={<PlayCircleOutlined />} loading={isRunning} onClick={handleRun}>
          {isRunning ? '引擎轰鸣中...' : '提交渲染'}
        </Button>

        {resultImage && (
          <div style={{ marginTop: 10, background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 150, overflowY: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 10 }}>输出结果 (供调试):</Text>
            <pre style={{ fontSize: 10, margin: 0 }}>{resultImage}</pre>
          </div>
        )}
      </Space>

      <Handle type="source" position={Position.Right} id="out" />
    </Card>
  );
}

nodeRegistry.register({
  type: 'comfyUIEngine',
  displayName: '🚀 ComfyUI 引擎', // 这就是会在你左侧菜单里显示出来的名字！
  component: ComfyUIEngineNode,
  defaultData: { workflowJson: '' }
});