// src/stores/canvasStore.ts
import { create } from 'zustand';
import {type Node, type Edge, applyNodeChanges, applyEdgeChanges } from 'reactflow';
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
  // 🌟 新增：批量覆盖画布数据（用于读档和清空）
  setCanvasData: (nodes: Node[], edges: Edge[]) => void;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  past: [],
  future: [],

// 🌟 新增的实现
  setCanvasData: (nodes, edges) => {
    set({
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
      past: [],   // 读档或清空时，重置撤销历史
      future: []
    });
  },

  // 保存当前状态到 past（变化前），并清空 future
  saveHistory: () => {
    const { nodes, edges, past } = get();
  const nodesCopy = structuredClone(nodes);
  const edgesCopy = structuredClone(edges);
  console.log('Saving history, nodes count:', nodesCopy.length, 'nodes ids:', nodesCopy.map(n => n.id));
    set({
      past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      future: [],
    });
  },

  onNodesChange: (changes) => {
    //get().saveHistory(); // 先保存历史
    set(
      produce((state: CanvasState) => {
        state.nodes = applyNodeChanges(changes, state.nodes);
      })
    );
  },

  onEdgesChange: (changes) => {
    //get().saveHistory();
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
    get().saveHistory();
    set(
      produce((state: CanvasState) => {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) node.data = { ...node.data, ...data };
      })
    );
  },

  undo: () => {
    console.log('undo called, current nodes ids:', get().nodes.map(n => n.id));
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const newPast = past.slice(0, -1);
    const lastState = past[past.length - 1];
    console.log('lastState nodes ids:', lastState.nodes.map(n => n.id));
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
    const nextState = future[0];
    set({
      future: newFuture,
      past: [...past, { nodes: structuredClone(nodes), edges: structuredClone(edges) }],
      nodes: structuredClone(nextState.nodes),
      edges: structuredClone(nextState.edges),
    });
  },
}));