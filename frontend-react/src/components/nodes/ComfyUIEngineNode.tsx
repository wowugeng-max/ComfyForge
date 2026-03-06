import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Select, Input, Button, message, Typography, Divider, Space } from 'antd';
import { PlayCircleOutlined, ApiOutlined, CloudServerOutlined, SaveOutlined } from '@ant-design/icons';
import { providerApi } from '../../api/providers';
import { keyApi } from '../../api/keys';
import apiClient from '../../api/client';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { useDrop } from 'react-dnd';
import { DndItemTypes } from '../../constants/dnd'; 
import { BaseNode } from './BaseNode';
import { useCanvasStore } from '../../stores/canvasStore'; // 🌟 引入全局状态

const { Text } = Typography;
const { TextArea } = Input;

export default function ComfyUIEngineNode(props: NodeProps) {
  const { data, id } = props;
  const { updateNodeData } = useCanvasStore(); // 🌟 用于动态更新标题

  const [providers, setProviders] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(data.selectedProvider || null);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(data.selectedKeyId || null);
  
  // 核心数据状态
  const [workflowJson, setWorkflowJson] = useState<string>(data.workflowJson || '');
  const [parameters, setParameters] = useState<any>(data.parameters || null); // 解析出的参数配置
  const [paramValues, setParamValues] = useState<Record<string, any>>(data.paramValues || {}); // 用户填写的参数值

  const [isRunning, setIsRunning] = useState(false);
  const [resultOutput, setResultOutput] = useState<any>(null); 

  // 🌟 修复 1 & 2：拖拽加载时的智能脱壳与参数提取
  const [{ isOver }, drop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: any) => {
      const asset = item.asset;
      if (asset && (asset.type === 'workflow' || asset.type === 'prompt')) {
        try {
          const rawContent = asset.data?.content || asset.content || asset.data || {};
          let parsedData = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

          let finalWorkflowObj = parsedData;
          let finalParams = null;

          // 智能剥离 workflow_json 和 parameters
          if (parsedData && parsedData.workflow_json) {
            finalWorkflowObj = parsedData.workflow_json;
            finalParams = parsedData.parameters || null;
          } else if (parsedData && parsedData.parameters) {
            finalParams = parsedData.parameters;
          }

          const jsonString = JSON.stringify(finalWorkflowObj, null, 2);
          setWorkflowJson(jsonString);
          setParameters(finalParams);
          setParamValues({}); // 切换工作流时清空旧表单
          setResultOutput(null);

          // 🌟 动态更新节点数据：修改标题(label)并保存参数
          updateNodeData(id, {
            label: `🚀 ${asset.name}`, // 让 BaseNode 显示出漂亮的标题
            workflowJson: jsonString,
            parameters: finalParams,
            paramValues: {}
          });

          message.success(`成功加载: ${asset.name}`);
        } catch (err) {
          message.error('工作流数据解析失败');
        }
      } else {
        message.warning('请拖入“工作流”资产');
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
    setResultOutput(null);

    try {
      let finalWorkflow = JSON.parse(workflowJson);

      // 🌟 修复 2：将用户填写的动态参数精准注入到 JSON 深处
      if (parameters && Object.keys(paramValues).length > 0) {
        Object.keys(parameters).forEach(paramName => {
          const config = parameters[paramName];
          const val = paramValues[paramName];
          
          if (val !== undefined && val !== '' && config.node_id && config.field) {
            const pathParts = config.field.split('/'); // 如 "inputs/text"
            let current = finalWorkflow[config.node_id];
            if (current) {
              for (let i = 0; i < pathParts.length - 1; i++) {
                if (!current[pathParts[i]]) current[pathParts[i]] = {}; 
                current = current[pathParts[i]];
              }
              current[pathParts[pathParts.length - 1]] = val; // 🎯 致命一击：替换值
            }
          }
        });
      }

      const res = await apiClient.post('/generate', {
        api_key_id: selectedKeyId,
        provider: selectedProvider,
        model: 'comfyui-workflow',
        type: 'image',
        prompt: JSON.stringify(finalWorkflow), // 发送已注入参数的最终版
        params: { provider: selectedProvider } 
      });

      message.success('渲染成功！');
      setResultOutput(res.data.content);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '执行失败');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveAsset = () => {
      // 占位：后续对接资产保存 API
      message.info("暂未实现：正在对接资产保存接口...");
  };

// 在 ComfyUIEngineNode.tsx 中，直接覆盖 return (...)
  return (
    <BaseNode {...props}>
      <Handle type="target" position={Position.Left} id="in" />

      {/* 🚀 核心修复：移除 width: 300，替换为 100% 填充和防溢出 */}
      <div
        ref={drop}
        style={{
          width: '100%',
          height: '100%',
          padding: 8,
          border: isOver ? '2px dashed #1890ff' : '1px dashed transparent',
          backgroundColor: isOver ? '#f0f7ff' : 'transparent',
          transition: 'all 0.3s',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0
        }}
      >
        <div className="nodrag" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>

          <Space direction="vertical" size="small" style={{ width: '100%', flexShrink: 0 }}>
            <Select size="small" style={{ width: '100%' }} placeholder="1. 选择算力平台" options={providers.map(p => ({ label: p.display_name, value: p.id }))} value={selectedProvider} onChange={(val) => { setSelectedProvider(val); setSelectedKeyId(null); updateNodeData(id, { selectedProvider: val }); }} />
            <Select size="small" style={{ width: '100%' }} placeholder="2. 选择执行凭证" options={availableKeys.map(k => ({ label: `${k.description || '凭证'}`, value: k.id }))} value={selectedKeyId} onChange={(val) => { setSelectedKeyId(val); updateNodeData(id, { selectedKeyId: val }); }} disabled={!selectedProvider} />
          </Space>

          {parameters && Object.keys(parameters).length > 0 && (
            <div style={{ background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid #e8e8e8', flexShrink: 0 }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block', color: '#1890ff' }}>⚙️ 动态参数配置</Text>
              {Object.keys(parameters).map((paramName) => (
                <div key={paramName} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{paramName}</Text>
                  <Input size="small" value={paramValues[paramName] || ''} placeholder={`输入 ${paramName}...`} onChange={(e) => { const newVals = { ...paramValues, [paramName]: e.target.value }; setParamValues(newVals); updateNodeData(id, { paramValues: newVals }); }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ flexShrink: 0 }}>
            <Text type="secondary" style={{ fontSize: 11 }}><ApiOutlined /> JSON 源码 (自动生成)</Text>
            <TextArea rows={3} style={{ fontSize: 10 }} placeholder="将左侧的工作流资产拖拽到这里..." value={workflowJson} onChange={(e) => setWorkflowJson(e.target.value)} />
          </div>

          <Button type="primary" block icon={<PlayCircleOutlined />} loading={isRunning} onClick={handleRun} style={{ flexShrink: 0 }}>
            {isRunning ? '引擎轰鸣中...' : '提交渲染'}
          </Button>

          {resultOutput && (
            <div style={{ background: '#f6ffed', padding: 8, borderRadius: 6, border: '1px solid #b7eb8f', flexShrink: 0 }}>
              <Text strong style={{ fontSize: 12, color: '#389e0d' }}>✅ 渲染完成</Text>
              <pre style={{ fontSize: 10, margin: '8px 0', maxHeight: 80, overflowY: 'auto' }}>
                {JSON.stringify(resultOutput, null, 2)}
              </pre>
              <Button size="small" icon={<SaveOutlined />} onClick={handleSaveAsset} block>
                保存结果至资产库
              </Button>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" />
    </BaseNode>
  );
}

// 🌟 修复 1：注册时自带默认的 label，确保 BaseNode 初始渲染有标题
if (!nodeRegistry.get('comfyUIEngine')) {
  nodeRegistry.register({
    type: 'comfyUIEngine',
    displayName: '🚀 算力引擎',
    component: ComfyUIEngineNode,
    defaultData: { 
      label: '🚀 算力引擎', // 必须有这一行，标题才显形！
      workflowJson: '' 
    }
  });
}