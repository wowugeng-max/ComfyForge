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
    const next = future; // 🌟 保留修复好的
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