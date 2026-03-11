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

interface CanvasState {
  // ================= 基础画布状态 =================
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setCanvasData: (nodes: Node[], edges: Edge[]) => void;
  addNode: (node: Node) => void;
  updateNodeData: (id: string, data: any) => void;

  // ================= React Flow 交互钩子 =================
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // ================= 历史记录 (撤销/重做引擎) =================
  past: { nodes: Node[]; edges: Edge[] }[];
  future: { nodes: Node[]; edges: Edge[] }[];
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;

  // ================= DAG 全局执行引擎状态 =================
  isGlobalRunning: boolean;
  nodeRunStatus: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  setGlobalRunning: (isRunning: boolean) => void;
  setNodeStatus: (id: string, status: 'idle' | 'running' | 'success' | 'error') => void;
  resetAllNodeStatus: (currentNodes: Node[]) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  // 初始化空状态
  nodes: [],
  edges: [],
  past: [],
  future: [],

  // --- 🌟 1. 历史记录中心 ---
  saveHistory: () => {
    const { nodes, edges, past } = get();
    set({
      past: [...past, { nodes, edges }],
      future: [], // 每次有新动作，必须清空未来的重做记录
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
    const next = future; // 🌟 修复：精准提取数组的第一个快照
    const newFuture = future.slice(1);
    set({
      nodes: next.nodes,
      edges: next.edges,
      past: [...past, { nodes, edges }],
      future: newFuture,
    });
  },

  // --- 🌟 2. 画布交互钩子 ---
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    get().saveHistory(); // 连线时记录历史
    set({ edges: addEdge(connection, get().edges) });
  },

  // --- 🌟 3. 节点数据操控 ---
  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  setCanvasData: (nodes, edges) => {
    set({ nodes, edges, past: [], future: [] });
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

  // --- 🌟 4. DAG 执行引擎状态机 ---
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
      if (node.type === 'loadAsset' || node.type === 'display') {
        newStatus[node.id] = 'success';
      } else {
        newStatus[node.id] = 'idle';
      }
    });
    set({ nodeRunStatus: newStatus });
  }
}));