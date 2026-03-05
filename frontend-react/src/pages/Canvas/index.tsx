import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  addEdge, type Connection, type Edge, ReactFlowProvider, type ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Typography, Space, Tooltip, message, Layout, Tag, Divider, Input } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, ClearOutlined, SearchOutlined
} from '@ant-design/icons';

import { projectApi } from '../../api/projects';
import GenerateNode from '../../components/nodes/GenerateNode';
import DisplayNode from '../../components/nodes/DisplayNode';
import LoadAssetNode from '../../components/nodes/LoadAssetNode';
import AssetLibrary from '../../components/AssetLibrary';

const { Text, Title } = Typography;
const { Header, Sider, Content } = Layout;

const nodeTypes = {
  generate: GenerateNode,
  display: DisplayNode,
  loadAsset: LoadAssetNode,
};

// 预设所有的节点类型
const AVAILABLE_NODES = [
  { type: 'generate', label: '🧠 AI 大脑节点', desc: '调用大模型生成文本或图像' },
  { type: 'display', label: '📺 结果展示节点', desc: '在画布中预览生成的结果' },
  { type: 'loadAsset', label: '📦 资产输入节点', desc: '加载已有资产作为上下文' }
];

let idCounter = 0;
const getId = () => `node_${idCounter++}`;

const CanvasWorkspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [projectName, setProjectName] = useState('加载中...');
  const [saving, setSaving] = useState(false);

  // 🌟 菜单状态：包含坐标和搜索关键词
  const [menuConfig, setMenuConfig] = useState<{ x: number, y: number, flowX: number, flowY: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

// 🌟 核心魔法：使用一个 Ref 来记录单击倒计时
  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (id) {
      projectApi.getById(Number(id)).then(res => {
        setProjectName(res.data.name);
        const savedData = res.data.canvas_data;
        if (savedData && savedData.nodes) {
          setNodes(savedData.nodes || []);
          setEdges(savedData.edges || []);
        }
      }).catch(() => {
        setProjectName('未命名项目');
      });
    }
  }, [id, setNodes, setEdges]);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

 // 1. 纯净的关闭菜单函数（给单击节点等其他操作使用）
  const closeMenu = useCallback(() => {
    setMenuConfig(null);
    setSearchTerm('');
  }, []);

 // 2. 终极接管：把单击和双击合并到同一个函数里自己算！
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();

    if (clickTimeout.current) {
      // 💥 破局点：如果定时器还在，说明你在 250 毫秒内点了第二次！这就叫双击！
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;

      // --- 下面执行双击逻辑（打开菜单） ---
      if (!reactFlowInstance) return;
      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });

      setMenuConfig({
        x: event.clientX,
        y: event.clientY,
        flowX: position.x,
        flowY: position.y,
      });
      setSearchTerm('');
    } else {
      // 这是第一次点击。我们不马上关菜单，而是等 250 毫秒。
      // 如果 250 毫秒内没点第二次，就老老实实当做单击处理（关闭菜单）。
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        closeMenu();
      }, 250); // 250ms 是最符合人类直觉的双击间隔
    }
  }, [reactFlowInstance, closeMenu]);


  // 🌟 极其丝滑的右键菜单呼出（不会和左键冲突！）
  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    // 💥 关键点：这行代码会拦截掉浏览器自带的“刷新/另存为”右键丑菜单
    event.preventDefault();

    if (!reactFlowInstance) return;

    // 如果刚好有左键的延迟定时器在跑，顺手清理掉
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
    }

    // 复用已有的菜单状态逻辑
    const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setMenuConfig({
      x: event.clientX,
      y: event.clientY,
      flowX: position.x,
      flowY: position.y,
    });
    setSearchTerm('');
  }, [reactFlowInstance]);

  const addNodeFromMenu = (type: string, label: string) => {
    if (!menuConfig) return;
    const newNode = {
      id: getId(), type, position: { x: menuConfig.flowX, y: menuConfig.flowY }, data: { label: label },
    };
    setNodes((nds) => nds.concat(newNode));
    setMenuConfig(null);
    setSearchTerm('');
  };

  const handleSave = async () => {
    if (!reactFlowInstance || !id) return;
    setSaving(true);
    try {
      await projectApi.update(Number(id), { canvas_data: reactFlowInstance.toObject() });
      message.success('画布状态已安全保存！');
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 根据搜索词过滤节点
  const filteredNodes = AVAILABLE_NODES.filter(n => n.label.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Header style={{ height: 60, background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
        <Space size="large" style={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title="返回中枢大厅"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} /></Tooltip>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Title level={5} style={{ margin: 0 }}>{projectName}</Title><Tag color="processing" bordered={false}>创作中</Tag></div>
        </Space>
        <Space size="middle">
          <Button icon={<ClearOutlined />} onClick={() => { setNodes([]); setEdges([]); }}>清空</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存项目</Button>
          <Button type="default" icon={<PlayCircleOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }}>运行全局</Button>
        </Space>
      </Header>

      <Layout>
        <Sider width={320} theme="light" style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
            <Title level={5} style={{ margin: 0, color: '#1890ff' }}>💡 交互升级</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>现在可以在右侧画布<strong style={{ color: '#ff4d4f' }}>双击空白处</strong>呼出搜索菜单啦！就像 ComfyUI 一样。</Text>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AssetLibrary projectId={Number(id)} />
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

            zoomOnDoubleClick={false} // 保持关闭原生双击放大

            // 🌟 终极修复：删除 onPaneDoubleClick！全部交由 onPaneClick 统一接管
            onPaneClick={onPaneClick}
            onNodeClick={closeMenu}

            // 🌟 新增：绑定空白画布的右键菜单事件
            onPaneContextMenu={onPaneContextMenu}

            // 🌟 终极修复：同时绑定“退格键”和“Delete键”作为删除触发器
            deleteKeyCode={['Backspace', 'Delete']}

            // 💡 额外赠送的高级交互：按住 Shift 或 Ctrl 可以框选/多选节点，然后一键 Delete 批量删除
            selectionKeyCode={['Shift', 'Control', 'Meta']}
          >
            <Background color="#ccc" gap={16} />
            <Controls style={{ left: 16, right: 'auto' }} />
            <MiniMap style={{ border: '1px solid #e8e8e8', borderRadius: 8, right: 16, bottom: 16 }} zoomable pannable />
          </ReactFlow>

          {/* 🌟 复刻 ComfyUI 的双击搜索菜单 */}
          {menuConfig && (
            <div
              style={{
                position: 'fixed',
                left: menuConfig.x, top: menuConfig.y, zIndex: 9999,
                background: '#fff', boxShadow: '0 12px 24px rgba(0,0,0,0.2)',
                borderRadius: 8, width: 220, border: '1px solid #d9d9d9',
                animation: 'zoom-in 0.15s ease-out', overflow: 'hidden'
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: 8, background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <Input
                  prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                  placeholder="搜索节点..."
                  variant="borderless"
                  ref={(input) => input && setTimeout(() => input.focus(), 50)} // 🌟 极其关键：双击后直接键盘输入！
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ padding: 0 }}
                />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px' }}>
                {filteredNodes.length > 0 ? filteredNodes.map(node => (
                  <div
                    key={node.type}
                    onClick={() => addNodeFromMenu(node.type, node.label)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
                      transition: 'background 0.2s', display: 'flex', flexDirection: 'column'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e6f4ff'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Text strong style={{ fontSize: 13 }}>{node.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{node.desc}</Text>
                  </div>
                )) : (
                  <div style={{ padding: '16px 0', textAlign: 'center' }}><Text type="secondary">未找到节点</Text></div>
                )}
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