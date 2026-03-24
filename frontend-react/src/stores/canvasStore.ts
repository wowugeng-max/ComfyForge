// frontend-react/src/stores/canvasStore.ts
import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import { computeBoundingBox, toRelativePosition, toAbsolutePosition } from '../utils/groupUtils';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setCanvasData: (nodes: Node[], edges: Edge[]) => void;
  addNode: (node: Node) => void;
  updateNodeData: (id: string, data: any) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  past: { nodes: Node[]; edges: Edge[] }[];
  future: { nodes: Node[]; edges: Edge[] }[];
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  isGlobalRunning: boolean;
  nodeRunStatus: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  setGlobalRunning: (isRunning: boolean) => void;
  setNodeStatus: (id: string, status: 'idle' | 'running' | 'success' | 'error') => void;
  resetAllNodeStatus: (currentNodes: Node[]) => void;
  smartResetNodeStatus: (currentNodes: Node[]) => void;
  createGroup: (selectedNodeIds: string[], label?: string) => string;
  dissolveGroup: (groupId: string) => void;
  // 裂变系统
  executeFission: (sourceNodeId: string, items: any[]) => string[];
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  past: [],
  future: [],

  saveHistory: () => {
    const { nodes, edges, past } = get();
    set({
      past: [...past, { nodes, edges }],
      future: [],
    });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    set({
      nodes: previous.nodes,
      edges: previous.edges,
      past: newPast,
      future: [{ nodes, edges }, ...future],
    });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    set({
      nodes: next.nodes,
      edges: next.edges,
      past: [...past, { nodes, edges }],
      future: newFuture,
    });
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    get().saveHistory();
    set({ edges: addEdge(connection, get().edges) });

    // 🌟 智能水管魔法：一连上线，如果上游有存货，瞬间冲刷到下游！
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    if (sourceNode) {
      const fluidData = sourceNode.data.result || sourceNode.data.asset?.data || sourceNode.data.incoming_data;
      if (fluidData) {
        get().updateNodeData(connection.target, { incoming_data: fluidData });
      }
    }
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  setCanvasData: (nodes, edges) => {
    // 确保 group 节点排在其子节点之前（ReactFlow 要求）
    const sorted = [...nodes].sort((a, b) => {
      if (a.type === 'nodeGroup' && b.parentNode === a.id) return -1;
      if (b.type === 'nodeGroup' && a.parentNode === b.id) return 1;
      return 0;
    });
    set({ nodes: sorted, edges, past: [], future: [] });
  },

  addNode: (node) => {
    get().saveHistory();
    set({ nodes: [...get().nodes, node] });
  },

  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
    }));
  },

  isGlobalRunning: false,
  nodeRunStatus: {},

  setGlobalRunning: (isRunning) => set({ isGlobalRunning: isRunning }),

  setNodeStatus: (id, status) =>
    set((state) => ({
      nodeRunStatus: { ...state.nodeRunStatus, [id]: status }
    })),

  resetAllNodeStatus: (currentNodes) => {
    const newStatus: Record<string, 'idle' | 'running' | 'success' | 'error'> = {};
    currentNodes.forEach(node => {
      if (node.type === 'nodeGroup') return;
      newStatus[node.id] = 'idle';
    });
    set({ nodeRunStatus: newStatus });
  },
  smartResetNodeStatus: (currentNodes) => {
    const currentStatus = get().nodeRunStatus;
    const newStatus: Record<string, 'idle' | 'running' | 'success' | 'error'> = { ...currentStatus };

    currentNodes.forEach(node => {
      if (node.type === 'nodeGroup') return;
      if (currentStatus[node.id] !== 'success') {
        newStatus[node.id] = 'idle';
      }
    });

    set({ nodeRunStatus: newStatus });
  },

  createGroup: (selectedNodeIds, label = '节点组') => {
    const state = get();
    const selectedNodes = state.nodes.filter(n => selectedNodeIds.includes(n.id));
    if (selectedNodes.length < 2) return '';
    // 不允许已有 parentNode 的节点再次编组
    if (selectedNodes.some(n => n.parentNode)) return '';

    state.saveHistory();
    const bbox = computeBoundingBox(selectedNodes);
    const groupId = `group_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const groupNode: Node = {
      id: groupId,
      type: 'nodeGroup',
      position: { x: bbox.x, y: bbox.y },
      style: { width: bbox.width, height: bbox.height },
      data: { label, _collapsed: false, _muted: false, _isGroupRunning: false },
      dragHandle: '.custom-drag-handle',
    };

    const updatedNodes = state.nodes.map(n => {
      if (!selectedNodeIds.includes(n.id)) return n;
      return {
        ...n,
        parentNode: groupId,
        extent: 'parent' as const,
        expandParent: true,
        position: toRelativePosition(n.position, { x: bbox.x, y: bbox.y }),
      };
    });

    // 父节点必须在子节点之前
    const others = updatedNodes.filter(n => !selectedNodeIds.includes(n.id));
    const children = updatedNodes.filter(n => selectedNodeIds.includes(n.id));
    set({ nodes: [groupNode, ...others, ...children] });
    return groupId;
  },

  dissolveGroup: (groupId) => {
    const state = get();
    const groupNode = state.nodes.find(n => n.id === groupId && n.type === 'nodeGroup');
    if (!groupNode) return;

    state.saveHistory();
    const groupPos = groupNode.position;

    const updatedNodes = state.nodes
      .filter(n => n.id !== groupId)
      .map(n => {
        if (n.parentNode !== groupId) return n;
        const { parentNode, extent, expandParent, ...rest } = n as any;
        return {
          ...rest,
          position: toAbsolutePosition(n.position, groupPos),
          hidden: false,
          data: { ...rest.data, _muted: false },
        };
      });

    set({ nodes: updatedNodes });
  },

  // ================= 裂变系统 =================
  executeFission: (sourceNodeId: string, items: any[]) => {
    const state = get();
    const { nodes, edges } = state;
    const count = items.length;
    if (count === 0) return [];

    // 找到 source 的直接下游边
    const downstreamEdges = edges.filter(e => e.source === sourceNodeId);
    if (downstreamEdges.length === 0) return [];

    state.saveHistory();

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const allClonedRootIds: string[] = [];

    // 对每条下游边的目标节点执行裂变
    for (const downEdge of downstreamEdges) {
      const templateId = downEdge.target;
      const templateNode = nodes.find(n => n.id === templateId);
      if (!templateNode) continue;

      // BFS 找到 template 的整个下游子树（含 template 自身）
      const subtreeIds: string[] = [templateId];
      const queue = [templateId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        edges.filter(e => e.source === current).forEach(e => {
          if (!subtreeIds.includes(e.target)) {
            subtreeIds.push(e.target);
            queue.push(e.target);
          }
        });
      }

      // 子树内部的边
      const subtreeEdges = edges.filter(
        e => subtreeIds.includes(e.source) && subtreeIds.includes(e.target)
      );

      // 第一个 item 复用原始模板节点（注入数据即可）
      // 第 1..N-1 个 item 克隆新节点
      for (let i = 0; i < count; i++) {
        if (i === 0) {
          // 复用原始节点，只注入数据
          allClonedRootIds.push(templateId);
          continue;
        }

        const ts = Date.now();
        const rnd = Math.floor(Math.random() * 10000);
        const idMap: Record<string, string> = {};

        // 克隆子树中的每个节点
        for (const origId of subtreeIds) {
          const orig = nodes.find(n => n.id === origId);
          if (!orig) continue;
          const newId = `${origId}_f${i}_${ts}_${rnd}`;
          idMap[origId] = newId;

          const yOffset = i * 220;
          newNodes.push({
            ...orig,
            id: newId,
            position: { x: orig.position.x, y: orig.position.y + yOffset },
            data: {
              ...orig.data,
              _fissionIndex: i,
              _fissionSource: sourceNodeId,
              // 清除运行时数据
              result: undefined,
              incoming_data: undefined,
              _runSignal: undefined,
            },
            selected: false,
          });
        }

        // 克隆子树内部的边
        for (const origEdge of subtreeEdges) {
          const newSource = idMap[origEdge.source];
          const newTarget = idMap[origEdge.target];
          if (newSource && newTarget) {
            newEdges.push({
              ...origEdge,
              id: `${origEdge.id}_f${i}_${ts}_${rnd}`,
              source: newSource,
              target: newTarget,
            });
          }
        }

        // 从 source 到克隆根节点的边
        const clonedRootId = idMap[templateId];
        if (clonedRootId) {
          allClonedRootIds.push(clonedRootId);
          newEdges.push({
            id: `fission_edge_${i}_${ts}_${rnd}`,
            source: sourceNodeId,
            sourceHandle: downEdge.sourceHandle,
            target: clonedRootId,
            targetHandle: downEdge.targetHandle,
          });
        }
      }
    }

    // 批量添加节点和边
    set({
      nodes: [...nodes, ...newNodes],
      edges: [...edges, ...newEdges],
    });

    // 为所有裂变根节点设置 idle 状态
    const newStatus = { ...state.nodeRunStatus };
    for (const node of newNodes) {
      newStatus[node.id] = 'idle';
    }
    set({ nodeRunStatus: newStatus });

    return allClonedRootIds;
  },
}));
