import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  addEdge, type Connection, type Edge, ReactFlowProvider, type ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Typography, Space, Tooltip, message, Layout, Tag } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, ClearOutlined
} from '@ant-design/icons';

// API
import { projectApi } from '../../api/projects';

// 自定义节点
import GenerateNode from '../../components/nodes/GenerateNode';
import DisplayNode from '../../components/nodes/DisplayNode';
import LoadAssetNode from '../../components/nodes/LoadAssetNode';
import AssetLibrary from '../../components/AssetLibrary';

const { Text, Title } = Typography;
const { Header, Sider, Content } = Layout;

// 🌟 注册所有大将节点
const nodeTypes = {
  generate: GenerateNode,
  display: DisplayNode,
  loadAsset: LoadAssetNode,
};

let idCounter = 0;
const getId = () => `node_${idCounter++}`;

const CanvasWorkspace = () => {
  // 1. 获取 URL 里的 project/:id
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // 项目相关的状态
  const [projectName, setProjectName] = useState('加载中...');
  const [saving, setSaving] = useState(false);

// 2. 初始化：读取项目信息与历史画布状态
  useEffect(() => {
    if (id) {
      projectApi.getById(Number(id)).then(res => {
        setProjectName(res.data.name);

        // 🌟 恢复画布状态 (读档)
        const savedData = res.data.canvas_data;
        if (savedData && savedData.nodes) {
          setNodes(savedData.nodes || []);
          setEdges(savedData.edges || []);
          // 如果想恢复视角位置，可以调用 setViewport (后续可加)
        }
      }).catch(() => {
        message.error('项目加载失败');
        setProjectName('未命名项目');
      });
    }
  }, [id, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // 🌟 拖拽控制逻辑
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: getId(),
        type,
        position,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

// 🌟 核心：保存项目工作流到数据库的 canvas_data
  const handleSave = async () => {
    if (!reactFlowInstance || !id) return;
    setSaving(true);

    try {
      // 提取 ReactFlow 的完整快照
      const flowData = reactFlowInstance.toObject();

      // 发送 PUT 请求，只更新 canvas_data 字段
      await projectApi.update(Number(id), {
        canvas_data: flowData
      });

      message.success('画布状态已安全保存至项目！');
    } catch (error) {
      message.error('保存失败，请检查网络');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setNodes([]);
    setEdges([]);
    message.info('画布已清空');
  };

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      {/* ========================================== */}
      {/* 🌟 极美 TopBar 顶部控制台 */}
      {/* ========================================== */}
      <Header style={{
        height: 60, background: '#fff', borderBottom: '1px solid #f0f0f0',
        padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', zIndex: 10
      }}>
        {/* 左侧：返回大厅 & 项目名 */}
        <Space size="large" style={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title="返回中枢大厅" placement="bottom">
            <Button
              type="text"
              icon={<ArrowLeftOutlined style={{ fontSize: 18, color: '#595959' }} />}
              onClick={() => navigate('/')}
              style={{ width: 40, height: 40, borderRadius: 8 }}
            />
          </Tooltip>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Title level={5} style={{ margin: 0, fontWeight: 600, color: '#262626' }}>
              {projectName}
            </Title>
            <Tag color="processing" bordered={false} style={{ borderRadius: 4 }}>创作中</Tag>
          </div>
        </Space>

        {/* 右侧：全局操作按钮 */}
        <Space size="middle">
          <Button icon={<ClearOutlined />} onClick={handleClear}>清空</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} style={{ borderRadius: 6 }}>
            保存项目流
          </Button>
          <Button type="default" icon={<PlayCircleOutlined />} style={{ borderRadius: 6, borderColor: '#52c41a', color: '#52c41a' }}>
            运行全局
          </Button>
        </Space>
      </Header>

      <Layout>
        {/* ========================================== */}
        {/* 🌟 左侧 Sidebar 侧边栏 (节点与资产抽屉) */}
        {/* ========================================== */}
        <Sider width={280} theme="light" style={{ borderRight: '1px solid #f0f0f0', overflowY: 'auto' }}>
          <div style={{ padding: 20 }}>
            <Title level={5} style={{ marginBottom: 16 }}>🛠️ 节点组件库</Title>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              拖拽以下组件到右侧画布中构建流水线：
            </Text>

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div
                className="dndnode generate"
                onDragStart={(event) => { event.dataTransfer.setData('application/reactflow', 'generate'); event.dataTransfer.effectAllowed = 'move'; }}
                draggable
                style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, background: '#fafafa', cursor: 'grab', fontWeight: 500, transition: 'all 0.3s' }}
              >
                🧠 AI 大脑节点
              </div>
              <div
                className="dndnode display"
                onDragStart={(event) => { event.dataTransfer.setData('application/reactflow', 'display'); event.dataTransfer.effectAllowed = 'move'; }}
                draggable
                style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, background: '#fafafa', cursor: 'grab', fontWeight: 500 }}
              >
                📺 结果展示节点
              </div>
              <div
                className="dndnode loadAsset"
                onDragStart={(event) => { event.dataTransfer.setData('application/reactflow', 'loadAsset'); event.dataTransfer.effectAllowed = 'move'; }}
                draggable
                style={{ padding: '12px 16px', border: '1px solid #d9d9d9', borderRadius: 8, background: '#fafafa', cursor: 'grab', fontWeight: 500 }}
              >
                🖼️ 资产输入节点
              </div>
            </Space>

            {/* TODO: 这里下方未来可以直接挂载当前项目的 AssetLibrary 列表！ */}
            {/* 🌟 挂载当前项目的专属资产库！ */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: '1px solid #f0f0f0' }}>
              <AssetLibrary projectId={Number(id)} />
            </div>
          </div>
        </Sider>

        {/* ========================================== */}
        {/* 🌟 核心：无限画布区域 */}
        {/* ========================================== */}
        <Content ref={reactFlowWrapper} style={{ background: '#f0f2f5' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background color="#ccc" gap={16} />
            <Controls style={{ left: 16, right: 'auto' }} />
            <MiniMap style={{ border: '1px solid #e8e8e8', borderRadius: 8, right: 16, bottom: 16 }} zoomable pannable />
          </ReactFlow>
        </Content>
      </Layout>
    </Layout>
  );
};

// 使用 ReactFlowProvider 包裹以支持底层 Hook
export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasWorkspace />
    </ReactFlowProvider>
  );
}