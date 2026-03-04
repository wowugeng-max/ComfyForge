import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BaseNode } from './BaseNode';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { Select, Button, Typography, Space, Divider, Tag } from 'antd';
import { ApiOutlined, PartitionOutlined, BuildOutlined } from '@ant-design/icons';

const { Text } = Typography;

// 模拟的后端平台配置
const PLATFORMS = [
  { value: 'local', label: '本地 (127.0.0.1:8188)', color: 'blue' },
  { value: 'runninghub', label: 'RunningHub 云端', color: 'purple' },
  { value: 'vivita', label: 'Vivita 云算力', color: 'cyan' },
];

export const ComfyUIEngineNode: React.FC<NodeProps> = (props) => {
  const { isConnectable } = props;
  const [platform, setPlatform] = useState('local');
  const [template, setTemplate] = useState<string | null>(null);

  // 核心状态：存储动态解析出来的输入项
  const [dynamicInputs, setDynamicInputs] = useState<Array<{ id: string, type: string, label: string }>>([]);

  // 🌟 核心魔法：模拟解析 ComfyUI JSON 工作流
  const handleLoadTemplate = () => {
    // 这里模拟从后端拉取到了一个复杂的 SDXL 生图 JSON 工作流
    const mockWorkflowJSON: Record<string, any> = {
      "3": { class_type: "CLIPTextEncode", _meta: { title: "正向提示词" } },
      "4": { class_type: "CLIPTextEncode", _meta: { title: "反向提示词" } },
      "10": { class_type: "LoadImage", _meta: { title: "垫图 (Image)" } },
      "8": { class_type: "VAEDecode" } // 不需要暴露的节点
    };

    const parsedInputs = [];

    // 遍历 JSON 节点，寻找需要暴露为输入的节点
    for (const [nodeId, nodeData] of Object.entries(mockWorkflowJSON)) {
      if (nodeData.class_type === 'CLIPTextEncode') {
        parsedInputs.push({ id: nodeId, type: 'text', label: nodeData._meta?.title || `文本输入 ${nodeId}` });
      } else if (nodeData.class_type === 'LoadImage') {
        parsedInputs.push({ id: nodeId, type: 'image', label: nodeData._meta?.title || `图片输入 ${nodeId}` });
      }
    }

    setDynamicInputs(parsedInputs);
    setTemplate('sdxl_turbo_v1');
  };

  return (
    <BaseNode {...props}>
      <div style={{ width: 280 }}>
        {/* 顶部标题栏 */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <PartitionOutlined style={{ color: '#1890ff', fontSize: 16 }} />
          <Text strong>ComfyUI 通用引擎</Text>
        </div>

        {/* 1. 算力平台切换 */}
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>1. 算力平台 (后端引擎)</Text>
          <Select
            size="small"
            style={{ width: '100%' }}
            value={platform}
            onChange={setPlatform}
            options={PLATFORMS}
            suffixIcon={<ApiOutlined />}
          />
        </div>

        {/* 2. 加载工作流模板 */}
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>2. 工作流模板 (JSON)</Text>
          {!template ? (
            <Button size="small" type="dashed" block onClick={handleLoadTemplate} icon={<BuildOutlined />}>
              加载 SDXL 测试模板
            </Button>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f5f5', padding: '4px 8px', borderRadius: 4 }}>
              <Text style={{ fontSize: 12 }} strong>sdxl_turbo_v1.json</Text>
              <Button type="link" size="small" danger onClick={() => { setTemplate(null); setDynamicInputs([]); }}>卸载</Button>
            </div>
          )}
        </div>

        {/* 🌟 3. 动态长出的输入句柄 (Handles) */}
        {dynamicInputs.length > 0 && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>动态暴露参数 (等待连线注入)</Text>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
              {dynamicInputs.map((input, index) => (
                <div key={input.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', padding: '4px 8px', borderRadius: 4, border: '1px solid #e8e8e8' }}>
                  {/* 极其关键：根据解析出的 ID 动态生成 Handle！ */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`in_${input.id}`}
                    style={{ top: 15 + index * 36, background: input.type === 'image' ? '#722ed1' : '#13c2c2' }}
                    isConnectable={isConnectable}
                  />
                  <Text style={{ fontSize: 12 }}>{input.label}</Text>
                  <Tag color={input.type === 'image' ? 'purple' : 'cyan'} style={{ margin: 0 }}>
                    {input.type === 'image' ? '图片' : '文本'}
                  </Tag>
                </div>
              ))}
            </div>
          </>
        )}

        <Button type="primary" size="small" block style={{ marginTop: 16 }} disabled={!template}>
          发送至 {PLATFORMS.find(p => p.value === platform)?.label.split(' ')[0]} 运行
        </Button>

        {/* 固定的最终输出圆点 */}
        <Handle type="source" position={Position.Right} isConnectable={isConnectable} id="out" style={{ background: '#52c41a' }} />
      </div>
    </BaseNode>
  );
};

// 注册节点
if (!nodeRegistry.get('comfyui_engine')) {
  nodeRegistry.register({ type: 'comfyui_engine', displayName: 'ComfyUI 引擎', component: ComfyUIEngineNode });
}

export default ComfyUIEngineNode;