import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  addEdge, type Connection, type Edge, ReactFlowProvider, type ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
// 🌟 引入了 Select 组件用于保存模式选择
import { Button, Typography, Space, Tooltip, message, Layout, Tag, Divider, Input, Select } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, ClearOutlined, SearchOutlined,
  // 🌟 新增的图标
  MenuFoldOutlined, MenuUnfoldOutlined, UndoOutlined, RedoOutlined, SyncOutlined, ClockCircleOutlined,
  StopOutlined
} from '@ant-design/icons';

import { projectApi } from '../../api/projects';
import GenerateNode from '../../components/nodes/GenerateNode';
import DisplayNode from '../../components/nodes/DisplayNode';
import LoadAssetNode from '../../components/nodes/LoadAssetNode';
import AssetLibrary from '../../components/AssetLibrary';
import { useCanvasStore } from '../../stores/canvasStore';
import ComfyUIEngineNode from '../../components/nodes/ComfyUIEngineNode';

const { Text, Title } = Typography;
const { Header, Sider, Content } = Layout;

const nodeTypes = {
  generate: GenerateNode,
  display: DisplayNode,
  loadAsset: LoadAssetNode,
  comfyUIEngine: ComfyUIEngineNode,
};

const AVAILABLE_NODES = [
  { type: 'generate', label: '🧠 AI 大脑节点', desc: '调用大模型生成文本或图像' },
  { type: 'display', label: '📺 结果展示节点', desc: '在画布中预览生成的结果' },
  { type: 'loadAsset', label: '📦 资产输入节点', desc: '加载已有资产作为上下文' },
  { type: 'comfyUIEngine', label: '🚀 算力引擎', desc: '调度本地 5090 或云端物理机渲染' }
];

// ✅ 替换为绝对防碰撞的唯一 ID 生成器 (时间戳 + 随机后缀)
const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

const CanvasWorkspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // 🌟 从你真实的 Store 中提取需要的方法（包括撤销重做和新加的引擎状态）
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setCanvasData, updateNodeData,
    undo, redo, past, future,
    // 🌟 DAG 引擎特供
    isGlobalRunning, setGlobalRunning,
    nodeRunStatus, setNodeStatus, resetAllNodeStatus
  } = useCanvasStore();

  const [projectName, setProjectName] = useState('加载中...');
  const [saving, setSaving] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [saveMode, setSaveMode] = useState<string>('manual');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [menuConfig, setMenuConfig] = useState<{ x: number, y: number, flowX: number, flowY: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (id) {
      projectApi.getById(Number(id)).then(res => {
        setProjectName(res.data.name);
        const savedData = res.data.canvas_data;
        if (savedData && savedData.nodes) {
          setCanvasData(savedData.nodes || [], savedData.edges || []);
        }
      }).catch(() => {
        setProjectName('未命名项目');
      });
    }
  }, [id, setCanvasData]);

  const closeMenu = useCallback(() => {
    setMenuConfig(null);
    setSearchTerm('');
  }, []);

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      if (!reactFlowInstance) return;
      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenuConfig({ x: event.clientX, y: event.clientY, flowX: position.x, flowY: position.y });
      setSearchTerm('');
    } else {
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        closeMenu();
      }, 250);
    }
  }, [reactFlowInstance, closeMenu]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (!reactFlowInstance) return;
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
    }
    const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setMenuConfig({ x: event.clientX, y: event.clientY, flowX: position.x, flowY: position.y });
    setSearchTerm('');
  }, [reactFlowInstance]);

  const addNodeFromMenu = (type: string, label: string) => {
    if (!menuConfig) return;
    const newNode = { id: getId(), type, position: { x: menuConfig.flowX, y: menuConfig.flowY }, data: { label: label } };
    addNode(newNode);
    closeMenu();
  };

  const handleSave = useCallback(async (isSilent = false) => {
    if (!reactFlowInstance || !id) return;
    setSaving(true);
    try {
      await projectApi.update(Number(id), { canvas_data: reactFlowInstance.toObject() });
      if (!isSilent) message.success('画布状态已安全保存！');
    } catch (error) {
      if (!isSilent) message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [reactFlowInstance, id]);

  useEffect(() => {
    if (saveMode === 'realtime') {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        handleSave(true);
      }, 1500);
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, saveMode, handleSave]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (saveMode.startsWith('auto_')) {
      const seconds = parseInt(saveMode.split('_'), 10);
      intervalId = setInterval(() => {
        handleSave(true);
      }, seconds * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [saveMode, handleSave]);

  // ================= 🌟 核心新增：DAG 全局启动器 =================
  const handleGlobalRun = () => {
    if (isGlobalRunning) {
      setGlobalRunning(false);
      message.info("🛑 全局流水线已急刹车！");
      return;
    }
    if (nodes.length === 0) return message.warning("画布太空了，先添点节点吧！");

    resetAllNodeStatus(nodes);
    setGlobalRunning(true);
    message.success("🚀 漫剧工业流水线，启动！");
  };

  // ================= 🌟 核心大脑：DAG 拓扑自动驱动引擎 =================
  useEffect(() => {
    if (!isGlobalRunning) return;

    let allDone = true;
    let hasRunning = false;
    let newlyTriggered = false;
    let hasError = false;

    nodes.forEach((node) => {
      const status = nodeRunStatus[node.id] || 'idle';
      if (status === 'error') hasError = true;
      if (status === 'running') hasRunning = true;
      if (status !== 'success') allDone = false;

      if (status === 'idle') {
        const incomingEdges = edges.filter((e) => e.target === node.id);
        const isReady = incomingEdges.every((e) => nodeRunStatus[e.source] === 'success');

        if (isReady && !hasError) {
          console.log(`[DAG 引擎] 条件达成，触发节点: ${node.id}`);
          setNodeStatus(node.id, 'running');
          updateNodeData(node.id, { _runSignal: Date.now() });
          newlyTriggered = true;
        }
      }
    });

    if (hasError) {
      setGlobalRunning(false);
    } else if (allDone && nodes.length > 0) {
      setGlobalRunning(false);
      message.success("✨ 太棒了！全部流水线节点执行完毕！", 3);
    } else if (!newlyTriggered && !hasRunning && !allDone) {
      message.error("🚨 检测到死锁或有未连接的节点孤岛，执行强行终止！");
      setGlobalRunning(false);
    }
  }, [isGlobalRunning, nodeRunStatus, nodes, edges, updateNodeData, setNodeStatus, setGlobalRunning]);

  const filteredNodes = AVAILABLE_NODES.filter(n => n.label.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Header style={{ height: 60, background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>

        {/* ================= 🌟 头部左侧 ================= */}
        <Space size="middle" style={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={isSidebarOpen ? "收起资产库" : "展开资产库"}>
            <Button type="text" icon={isSidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} onClick={() => setIsSidebarOpen(!isSidebarOpen)} />
          </Tooltip>
          <Tooltip title="返回中枢大厅"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} /></Tooltip>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Title level={5} style={{ margin: 0 }}>{projectName}</Title><Tag color="processing" bordered={false}>创作中</Tag></div>
        </Space>

        {/* ================= 🌟 头部右侧 ================= */}
        <Space size="middle">
          {/* 1. 撤销/重做组 */}
          <Space.Compact>
            <Tooltip title="撤销 (Ctrl+Z)"><Button icon={<UndoOutlined />} onClick={undo} disabled={past.length === 0} /></Tooltip>
            <Tooltip title="重做 (Ctrl+Y)"><Button icon={<RedoOutlined />} onClick={redo} disabled={future.length === 0} /></Tooltip>
          </Space.Compact>

          <Button icon={<ClearOutlined />} onClick={() => setCanvasData([], [])}>清空</Button>

          {/* 2. 保存策略组 */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#fafafa', padding: '4px', borderRadius: 8, border: '1px solid #f0f0f0' }}>
            <Select
              variant="borderless" value={saveMode} onChange={setSaveMode} style={{ width: 130 }}
              options={[
                { value: 'manual', label: <span><SaveOutlined /> 手动保存</span> },
                { value: 'realtime', label: <span><SyncOutlined spin={saving && saveMode === 'realtime'} style={{color: '#1890ff'}} /> 实时保存</span> },
                { value: 'auto_10', label: <span><ClockCircleOutlined /> 自动 (10秒)</span> },
                { value: 'auto_30', label: <span><ClockCircleOutlined /> 自动 (30秒)</span> },
              ]}
            />
            <Button type={saveMode === 'manual' ? "primary" : "default"} icon={<SaveOutlined />} loading={saving && saveMode === 'manual'} onClick={() => handleSave(false)}>
              保存
            </Button>
          </div>

          <Button
            icon={isGlobalRunning ? <StopOutlined /> : <PlayCircleOutlined />}
            onClick={handleGlobalRun}
            type={isGlobalRunning ? "primary" : "default"}
            danger={isGlobalRunning}
            style={
              isGlobalRunning
                ? { fontWeight: 'bold', boxShadow: '0 0 10px rgba(255,0,0,0.5)' }
                : { fontWeight: 'bold', borderColor: '#52c41a', color: '#52c41a' }
            }
          >
            {isGlobalRunning ? '紧急停止' : '运行全局'}
          </Button>
        </Space>
      </Header>

      <Layout>
        {/* ================= 🌟 改造侧边栏 (支持动态折叠) ================= */}
        <Sider
          width={320}
          collapsedWidth={0}
          collapsed={!isSidebarOpen}
          theme="light"
          style={{ borderRight: isSidebarOpen ? '1px solid #f0f0f0' : 'none', display: 'flex', flexDirection: 'column', transition: 'all 0.3s' }}
        >
          {/* 🌟 核心防挤压容器：保证内部资产卡片在收缩时不会变形 */}
          <div style={{ width: 320, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              <Title level={5} style={{ margin: 0, color: '#1890ff' }}>💡 交互升级</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>现在可以在右侧画布<strong style={{ color: '#ff4d4f' }}>双击空白处</strong>呼出搜索菜单啦！就像 ComfyUI 一样。</Text>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <AssetLibrary projectId={Number(id)} />
            </div>
          </div>
        </Sider>

        <Content ref={reactFlowWrapper} style={{ background: '#f0f2f5', position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            fitView
            zoomOnDoubleClick={false}
            onPaneClick={onPaneClick}
            onNodeClick={closeMenu}
            onPaneContextMenu={onPaneContextMenu}
            deleteKeyCode={['Backspace', 'Delete']}
            selectionKeyCode={['Shift', 'Control', 'Meta']}
          >
            <Background color="#ccc" gap={16} />
            <Controls style={{ left: 16, right: 'auto' }} />
            <MiniMap style={{ border: '1px solid #e8e8e8', borderRadius: 8, right: 16, bottom: 16 }} zoomable pannable />
          </ReactFlow>

          {/* 右键搜索菜单保持不变 */}
          {menuConfig && (
            <div
              style={{
                position: 'fixed', left: menuConfig.x, top: menuConfig.y, zIndex: 9999,
                background: '#fff', boxShadow: '0 12px 24px rgba(0,0,0,0.2)',
                borderRadius: 8, width: 220, border: '1px solid #d9d9d9',
                animation: 'zoom-in 0.15s ease-out', overflow: 'hidden'
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: 8, background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <Input prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} placeholder="搜索节点..." variant="borderless" ref={(input) => input && setTimeout(() => input.focus(), 50)} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: 0 }} />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px' }}>
                {filteredNodes.length > 0 ? filteredNodes.map(node => (
                  <div
                    key={node.type} onClick={() => addNodeFromMenu(node.type, node.label)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', display: 'flex', flexDirection: 'column' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e6f4ff'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Text strong style={{ fontSize: 13 }}>{node.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{node.desc}</Text>
                  </div>
                )) : <div style={{ padding: '16px 0', textAlign: 'center' }}><Text type="secondary">未找到节点</Text></div>}
              </div>
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasWorkspace />
    </ReactFlowProvider>
  );
}