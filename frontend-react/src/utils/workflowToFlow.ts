import type {Node, Edge} from 'reactflow';

export interface WorkflowNodeData {
  class_type: string;
  inputs: Record<string, any>;
  _meta?: { title?: string; node?: { x?: number; y?: number } };
}

export function workflowToFlow(workflowJson: Record<string, WorkflowNodeData>): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 创建节点
  Object.entries(workflowJson).forEach(([nodeId, nodeData]) => {
    const pos = nodeData._meta?.node || { x: Math.random() * 500, y: Math.random() * 500 };
    nodes.push({
      id: nodeId,
      type: 'customNode', // 使用自定义节点类型
      position: { x: pos.x || 0, y: pos.y || 0 },
      data: {
        label: nodeData._meta?.title || nodeData.class_type,
        ...nodeData,
      },
    });
  });

  // 递归遍历 inputs 找出所有连接
  const traverse = (obj: any, targetNodeId: string, targetPath: string[]) => {
    if (Array.isArray(obj) && obj.length >= 2 && typeof obj[0] === 'string') {
      // 形如 ["sourceNodeId", outputIndex] 的连接
      const [sourceId, sourceHandle] = obj;
      edges.push({
        id: `${sourceId}-${targetNodeId}-${targetPath.join('-')}`,
        source: sourceId,
        target: targetNodeId,
        sourceHandle: `output-${sourceHandle}`,
        targetHandle: targetPath.join('.'),
      });
    } else if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        traverse(value, targetNodeId, [...targetPath, key]);
      });
    }
  };

  Object.entries(workflowJson).forEach(([nodeId, nodeData]) => {
    traverse(nodeData.inputs, nodeId, []);
  });

  return { nodes, edges };
}