// src/stores/canvasStore.ts
import { create } from 'zustand';
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Connection } from 'reactflow';
import { produce } from 'immer';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  past: Array<{ nodes: Node[]; edges: Edge[] }>;
  future: Array<{ nodes: Node[]; edges: Edge[] }>;

  // Actions
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  setCanvasData: (nodes: Node[], edges: Edge[]) => void;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;

  // 🌟 新增：DAG 全局执行引擎状态
  isGlobalRunning: boolean;
  nodeRunStatus: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  setGlobalRunning: (isRunning: boolean) => void;
  setNodeStatus: (id: string, status: 'idle' | 'running' | 'success' | 'error') => void;
  resetAllNodeStatus: (currentNodes: Node[]) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  past: [],
  future: [],

  setCanvasData: (nodes, edges) => {
    set({
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
      past: [],
      future: []
    });
  },

  saveHistory: () => {
    const { nodes, edges, past } = get();
    set({
      past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      future: [],
    });
  },

  onNodesChange: (changes) => {
    set(
      produce((state: CanvasState) => {
        state.nodes = applyNodeChanges(changes, state.nodes);
      })
    );
  },

  onEdgesChange: (changes) => {
    set(
      produce((state: CanvasState) => {
        state.edges = applyEdgeChanges(changes, state.edges);
      })
    );
  },

  onConnect: (connection) => {
    get().saveHistory();
    set(
      produce((state: CanvasState) => {
        state.edges.push({ ...connection, id: `e-${Date.now()}-${Math.random()}` });
      })
    );
  },

  addNode: (node) => {
    get().saveHistory();
    set(
      produce((state: CanvasState) => {
        state.nodes.push(node);
      })
    );
  },

  removeNode: (nodeId) => {
    get().saveHistory();
    set(
      produce((state: CanvasState) => {
        state.nodes = state.nodes.filter((n) => n.id !== nodeId);
        state.edges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      })
    );
  },

  updateNodeData: (nodeId, data) => {
    // get().saveHistory(); // 注意：如果不需要每次修改参数都进历史栈，这里可以注释掉
    set(
      produce((state: CanvasState) => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) node.data = { ...node.data, ...data };
      })
    );
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const newPast = past.slice(0, -1);
    const lastState = past[past.length - 1];
    set({
      past: newPast,
      future: [{ nodes: structuredClone(nodes), edges: structuredClone(edges) }, ...future],
      nodes: structuredClone(lastState.nodes),
      edges: structuredClone(lastState.edges),
    });
  },

  redo: () => {
    const { future, past, nodes, edges } = get();
    if (future.length === 0) return;
    const newFuture = future.slice(1);
    const nextState = future;
    set({
      future: newFuture,
      past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: structuredClone(nextState.nodes),
      edges: structuredClone(nextState.edges),
    });
  },

  // ================= 🌟 DAG 引擎实现 =================
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
      // 展示节点和输入节点天生即 success，直接放行
      if (node.type === 'loadAsset' || node.type === 'display') {
        newStatus[node.id] = 'success';
      } else {
        newStatus[node.id] = 'idle';
      }
    });
    set({ nodeRunStatus: newStatus });
  }
}));