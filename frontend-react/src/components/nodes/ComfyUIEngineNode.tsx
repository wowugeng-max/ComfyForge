// src/components/nodes/ComfyUIEngineNode.tsx
import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Select, Input, Button, message, Typography } from 'antd';
import { PlayCircleOutlined, ApiOutlined, CloudServerOutlined } from '@ant-design/icons';
import { providerApi } from '../../api/providers';
import { keyApi } from '../../api/keys';
import apiClient from '../../api/client';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { useDrop } from 'react-dnd';
import { DndItemTypes } from '../../constants/dnd';
import { BaseNode } from './BaseNode'; // 🌟 核心：引入你项目原生的基础节点外壳！

const { Text } = Typography;
const { TextArea } = Input;

export default function ComfyUIEngineNode(props: NodeProps) {
  const { data, id } = props;
  const [providers, setProviders] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const [workflowJson, setWorkflowJson] = useState<string>(data.workflowJson || '');

  const [isRunning, setIsRunning] = useState(false);
  const [resultImage, setResultImage] = useState<any>(null);

  // 🌟 参考 LoadAssetNode 的拖拽监听方式
  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: any) => {
      const asset = item.asset;
      if (asset && (asset.type === 'workflow' || asset.type === 'prompt')) {
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

  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const [provRes, keyRes] = await Promise.all([
          providerApi.getAll('comfyui'),
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

  const availableKeys = keys.filter(
    k => k.provider.toLowerCase() === selectedProvider?.toLowerCase() && k.is_active
  );

  const handleRun = async () => {
    if (!selectedProvider || !selectedKeyId) return message.warning('请选择平台和凭证');
    if (!workflowJson.trim()) return message.warning('请输入工作流');

    setIsRunning(true);
    setResultImage(null);

    try {
      const res = await apiClient.post('/generate', {
        api_key_id: selectedKeyId,
        provider: selectedProvider,
        model: 'comfyui-workflow',
        type: 'image',
        prompt: workflowJson,
        params: { provider: selectedProvider }
      });
      message.success('渲染成功！');
      setResultImage(JSON.stringify(res.data.content, null, 2));
    } catch (error: any) {
      message.error(error.response?.data?.detail || '执行失败');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    // 🌟 核心修复：使用 BaseNode 作为外壳，保持 UI 统一
    <BaseNode {...props}>
      <Handle type="target" position={Position.Left} id="in" />

      {/* 🌟 完全模仿 LoadAssetNode：内部用 div 接 ref，并加上 nodrag 阻挡画布拦截 */}
      <div
        ref={drop}
        className="nodrag"
        style={{
          width: 280,
          padding: 8,
          border: isOver ? '2px dashed #1890ff' : '1px dashed transparent',
          backgroundColor: isOver ? '#f0f7ff' : 'transparent',
          transition: 'all 0.3s',
          borderRadius: 6
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            <Text type="secondary" style={{ fontSize: 12 }}>执行凭证</Text>
            <Select
              style={{ width: '100%' }}
              placeholder={selectedProvider ? "选择凭证" : "请先选择平台"}
              options={availableKeys.map(k => ({ label: `${k.description || '凭证'}`, value: k.id }))}
              value={selectedKeyId}
              onChange={setSelectedKeyId}
              disabled={!selectedProvider}
            />
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}><ApiOutlined /> 工作流数据</Text>
            <TextArea
              rows={4}
              placeholder="将左侧的工作流资产拖拽到这里..."
              value={workflowJson}
              onChange={(e) => setWorkflowJson(e.target.value)}
            />
          </div>

          <Button type="primary" block icon={<PlayCircleOutlined />} loading={isRunning} onClick={handleRun}>
            {isRunning ? '引擎轰鸣中...' : '提交渲染'}
          </Button>

          {resultImage && (
            <div style={{ marginTop: 8, background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 100, overflowY: 'auto' }}>
              <pre style={{ fontSize: 10, margin: 0 }}>{resultImage}</pre>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" />
    </BaseNode>
  );
}

nodeRegistry.register({
  type: 'comfyUIEngine',
  displayName: '🚀 算力引擎',
  component: ComfyUIEngineNode,
  defaultData: { workflowJson: '' }
});