// src/pages/Canvas/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Layout, Typography } from 'antd';
import { useDrag, useDrop } from 'react-dnd';
import { useCanvasStore } from '../../stores/canvasStore';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { nodeTypes } from '../../components/nodes';
import AssetLibrary from '../../components/AssetLibrary';
import { DndItemTypes } from '../../constants/dnd';

const { Header, Sider, Content } = Layout;

// 可拖拽的节点库条目组件
const DraggableNodeItem: React.FC<{ definition: any }> = ({ definition }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DndItemTypes.NODE_TYPE,
    item: () => {
      console.log('🟢 dragging item:', definition.type);
      return {
        type: definition.type,
        defaultData: definition.defaultData,
        displayName: definition.displayName
      };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      style={{
        padding: 8,
        marginBottom: 8,
        border: '1px solid #ddd',
        borderRadius: 4,
        cursor: 'grab',
        background: isDragging ? '#e6f7ff' : '#f9f9f9',
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {definition.displayName}
    </div>
  );
};

export default function CanvasPage() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, undo, redo } = useCanvasStore();
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const reactFlowInstanceRef = useRef(null); // 用于存储最新实例，避免闭包问题

  // 设置画布作为放置目标
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: DndItemTypes.NODE_TYPE,
    drop: (item, monitor) => {
      console.log('✅ drop called with item:', item);
      const clientOffset = monitor.getClientOffset();
      const instance = reactFlowInstanceRef.current; // 使用 ref 获取最新实例
      if (!clientOffset || !instance) {
        console.log('❌ clientOffset or reactFlowInstance missing', { clientOffset, instance });
        return;
      }
      const position = instance.screenToFlowPosition({
        x: clientOffset.x,
        y: clientOffset.y,
      });
      console.log('📦 drop position:', position);
      const newNode = {
        id: `${item.type}-${Date.now()}`,
        type: item.type,
        position,
        data: item.defaultData || { label: item.displayName },
      };
      useCanvasStore.getState().addNode(newNode);
      console.log('✅ new node added');
    },
    hover: (item, monitor) => {
      // 可选的 hover 日志，避免刷屏太多
      // console.log('🟡 hovering over drop target');
    },
    canDrop: (item) => {
      console.log('🔵 canDrop check for item type:', item.type);
      return true; // 允许所有节点类型
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  useEffect(() => {
    console.log('Canvas nodes updated:', nodes.map(n => n.id));
  }, [nodes]);

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>无限画布</Typography.Title>
        <Button onClick={undo} style={{ marginLeft: 16 }}>撤销</Button>
        <Button onClick={redo} style={{ marginLeft: 8 }}>重做</Button>
        <div style={{ marginLeft: 16 }}>节点数: {nodes.length}</div>
      </Header>
      <Layout>
        <Sider width={250} theme="light" style={{ padding: 8, overflow: 'auto' }}>
          <Typography.Title level={5}>节点库</Typography.Title>
          {nodeRegistry.getAll().map((def) => (
            <DraggableNodeItem key={def.type} definition={def} />
          ))}
          <Typography.Title level={5} style={{ marginTop: 16 }}>资产库</Typography.Title>
          <AssetLibrary />
        </Sider>
        <Content>
          <ReactFlowProvider>
            <div
              ref={drop}
              style={{
                height: '100%',
                background: isOver ? 'rgba(24, 144, 255, 0.1)' : 'transparent',
                border: canDrop ? '2px dashed #1890ff' : 'none',
              }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={(instance) => {
                  console.log('🟣 React Flow initialized');
                  reactFlowInstanceRef.current = instance; // 同时设置 ref
                  setReactFlowInstance(instance); // 可选，用于其他渲染需求
                }}
                nodeTypes={nodeTypes}
                deleteKeyCode={['Delete', 'Backspace']}
                fitView
              >
                <Controls />
                <Background />
                <MiniMap />
              </ReactFlow>
            </div>
          </ReactFlowProvider>
        </Content>
      </Layout>
    </Layout>
  );
}