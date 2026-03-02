// src/components/nodes/BaseNode.tsx
import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type {PortDefinition} from '../../utils/nodeRegistry';

export interface BaseNodeProps extends NodeProps {
  data: {
    label?: string;
    inputs?: Record<string, PortDefinition>;
    outputs?: Record<string, PortDefinition>;
    [key: string]: any;
  };
}

export const BaseNode: React.FC<BaseNodeProps> = ({ id, data, selected, children }) => {
  const inputPorts = data.inputs || {};
  const outputPorts = data.outputs || {};

  return (
    <div
      style={{
        padding: 10,
        border: selected ? '2px solid #1890ff' : '1px solid #ddd',
        borderRadius: 5,
        background: '#fff',
        minWidth: 150,
        position: 'relative',
      }}
    >
      {/* 标题 */}
      <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: 8 }}>{data.label}</div>

      {/* 输入端口 */}
      {Object.entries(inputPorts).map(([key, port], index) => (
        <Handle
          key={`in-${key}`}
          type="target"
          position={Position.Left}
          id={key}
          style={{ top: `${((index + 1) * 100) / (Object.keys(inputPorts).length + 1)}%` }}
        />
      ))}

      {/* 输出端口 */}
      {Object.entries(outputPorts).map(([key, port], index) => (
        <Handle
          key={`out-${key}`}
          type="source"
          position={Position.Right}
          id={key}
          style={{ top: `${((index + 1) * 100) / (Object.keys(outputPorts).length + 1)}%` }}
        />
      ))}

      {/* 自定义内容区域 */}
      <div>{children}</div>
    </div>
  );
};