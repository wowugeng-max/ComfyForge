// src/components/nodes/index.ts
import './LoadAssetNode'; // 引入以便注册
import { nodeRegistry } from '../../utils/nodeRegistry';
import './GenerateNode';
import './DisplayNode';
import './ComfyUIEngineNode';

export const nodeTypes = nodeRegistry.getNodeTypes();