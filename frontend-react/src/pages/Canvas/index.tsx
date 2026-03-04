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
  const reactFlowInstanceRef = useRef(null);

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: DndItemTypes.NODE_TYPE,
    drop: (item, monitor) => {
      const clientOffset = monitor.getClientOffset();
      const instance = reactFlowInstanceRef.current;
      if (!clientOffset || !instance) return;

      const position = instance.screenToFlowPosition({
        x: clientOffset.x,
        y: clientOffset.y,
      });
      const newNode = {
        id: `${item.type}-${Date.now()}`,
        type: item.type,
        position,
        data: item.defaultData || { label: item.displayName },
      };
      useCanvasStore.getState().addNode(newNode);
    },
    canDrop: () => true,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>无限画布</Typography.Title>
        <Button onClick={undo} style={{ marginLeft: 16 }}>撤销</Button>
        <Button onClick={redo} style={{ marginLeft: 8 }}>重做</Button>
        <div style={{ marginLeft: 16 }}>节点数: {nodes.length}</div>
      </Header>
      <Layout>
        {/* 🌟 核心修改：将 Sider 改为 Flex 布局 */}
        <Sider width={260} theme="light" style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid #f0f0f0' }}>

          {/* 节点库区域：固定高度，不被压缩 */}
          <div style={{ padding: '16px 16px 8px 16px', flexShrink: 0 }}>
            <Typography.Title level={5}>节点库</Typography.Title>
            {nodeRegistry.getAll().map((def) => (
              <DraggableNodeItem key={def.type} definition={def} />
            ))}
          </div>

          {/* 资产库区域：占据剩余全部高度，内部自适应滚动 */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AssetLibrary />
          </div>

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
                  reactFlowInstanceRef.current = instance;
                  setReactFlowInstance(instance);
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