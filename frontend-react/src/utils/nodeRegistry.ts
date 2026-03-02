// src/utils/nodeRegistry.ts
// src/utils/nodeRegistry.ts
import type {NodeTypes} from 'reactflow';

export interface PortDefinition {
  type: 'text' | 'image' | 'video' | 'any';
  label?: string;
}

export interface NodeDefinition {
  type: string;
  displayName: string;
  icon?: string;
  description?: string;
  defaultData?: Record<string, any>;
  inputs?: Record<string, PortDefinition>;
  outputs?: Record<string, PortDefinition>;
  component: React.ComponentType<any>; // 具体的节点组件
}

class NodeRegistry {
  private nodes: Map<string, NodeDefinition> = new Map();

  register(definition: NodeDefinition) {
    this.nodes.set(definition.type, definition);
  }

  get(type: string): NodeDefinition | undefined {
    return this.nodes.get(type);
  }

  getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  // 转换为 React Flow 的 nodeTypes 对象
  getNodeTypes(): NodeTypes {
    const types: NodeTypes = {};
    this.nodes.forEach((def, type) => {
      types[type] = def.component;
    });
    return types;
  }
}

export const nodeRegistry = new NodeRegistry();