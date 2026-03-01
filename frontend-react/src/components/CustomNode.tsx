import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface CustomNodeData {
  label: string;
  inputs: Record<string, any>;
  onNodeClick?: (nodeId: string) => void;
}

export function CustomNode({ id, data, selected }: NodeProps<CustomNodeData>) {
  return (
    <div
      onClick={() => data.onNodeClick?.(id)}
      style={{
        padding: 10,
        border: selected ? '2px solid #1890ff' : '1px solid #ddd',
        borderRadius: 5,
        background: '#fff',
        cursor: 'pointer',
        minWidth: 150,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 'bold', marginBottom: 5 }}>{data.label}</div>
      <div style={{ fontSize: 12, color: '#666' }}>节点ID: {id}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}