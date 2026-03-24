import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDrop } from 'react-dnd';
import { DndItemTypes } from '../../constants/dnd';
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  addEdge, type Connection, type Edge, ReactFlowProvider, type ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
// 🌟 引入了 Select 组件用于保存模式选择
import { Button, Typography, Space, Tooltip, message, Layout, Tag, Divider, Input, Select, Modal } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlayCircleOutlined, ClearOutlined, SearchOutlined,
  // 🌟 新增的图标
  MenuFoldOutlined, MenuUnfoldOutlined, UndoOutlined, RedoOutlined, SyncOutlined, ClockCircleOutlined,
  StopOutlined, ThunderboltOutlined
} from '@ant-design/icons';

import { projectApi } from '../../api/projects';
import apiClient from '../../api/client';
import GenerateNode from '../../components/nodes/GenerateNode';
import DisplayNode from '../../components/nodes/DisplayNode';
import LoadAssetNode from '../../components/nodes/LoadAssetNode';
import AssetLibrary from '../../components/AssetLibrary';
import { useCanvasStore } from '../../stores/canvasStore';
import ComfyUIEngineNode from '../../components/nodes/ComfyUIEngineNode';
import GroupNode from '../../components/nodes/GroupNode';
import { getHandleDataType, areTypesCompatible } from '../../utils/handleTypes';

const { Text, Title } = Typography;
const { Header, Sider, Content } = Layout;

const nodeTypes = {
  generate: GenerateNode,
  display: DisplayNode,
  loadAsset: LoadAssetNode,
  comfyUIEngine: ComfyUIEngineNode,
  nodeGroup: GroupNode,
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
    undo, redo, past, future, saveHistory,
    // 🌟 DAG 引擎特供
    isGlobalRunning, setGlobalRunning,
    nodeRunStatus, setNodeStatus, resetAllNodeStatus, smartResetNodeStatus,
    createGroup, dissolveGroup, executeFission
  } = useCanvasStore();

  const [projectName, setProjectName] = useState('加载中...');
  const [saving, setSaving] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [saveMode, setSaveMode] = useState<string>('manual');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [menuConfig, setMenuConfig] = useState<{ x: number, y: number, flowX: number, flowY: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const clickTimeout = useRef<NodeJS.Timeout | null>(null);

  // 🎬 一键漫剧
  const [comicModalOpen, setComicModalOpen] = useState(false);
  const [comicConfig, setComicConfig] = useState({
    story: '',
    panelCount: 6,
    style: '',
    platform: '通用',
  });

  // 节点组右键菜单
  const [groupMenuConfig, setGroupMenuConfig] = useState<{ x: number; y: number; selectedNodeIds: string[]; dissolveGroupId?: string } | null>(null);
  const closeGroupMenu = useCallback(() => setGroupMenuConfig(null), []);

  // 💾 处理资产拖入画布：node_config 创建单节点，node_template 创建节点组
  const [, canvasDrop] = useDrop(() => ({
    accept: DndItemTypes.ASSET,
    drop: (item: { asset: any }, monitor) => {
      const asset = item.asset;
      if (!asset || !reactFlowInstance) return;

      // 只处理 node_config 和 node_template，其他类型由 LoadAssetNode 的 useDrop 处理
      if (asset.type !== 'node_config' && asset.type !== 'node_template') return;

      const clientOffset = monitor.getClientOffset();
      if (!clientOffset || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: clientOffset.x - bounds.left,
        y: clientOffset.y - bounds.top,
      });

      saveHistory();

      if (asset.type === 'node_config') {
        // 单节点配置：创建对应类型的节点，预填配置
        const { nodeType, config } = asset.data || {};
        if (!nodeType) return;
        const newNode = {
          id: getId(),
          type: nodeType,
          position,
          data: { ...config, label: asset.name || config?.label || nodeType },
          style: { width: 360, height: 380 },
        };
        addNode(newNode);
        message.success(`📦 已从资产恢复「${asset.name}」节点`);

      } else if (asset.type === 'node_template') {
        // 节点模板：批量创建节点+连线
        const { nodes: tplNodes, edges: tplEdges } = asset.data || {};
        if (!tplNodes || tplNodes.length === 0) return;

        const idMap: Record<number, string> = {};
        const newNodes: any[] = [];
        const newEdges: any[] = [];

        tplNodes.forEach((tpl: any, i: number) => {
          const newId = getId();
          idMap[i] = newId;
          newNodes.push({
            id: newId,
            type: tpl.type,
            position: {
              x: position.x + (tpl.relativePosition?.x || 0),
              y: position.y + (tpl.relativePosition?.y || 0),
            },
            data: { ...tpl.config, label: tpl.config?.label || tpl.type },
            style: { width: 360, height: 380 },
          });
        });

        (tplEdges || []).forEach((tpl: any) => {
          const sourceId = idMap[tpl.sourceIndex];
          const targetId = idMap[tpl.targetIndex];
          if (sourceId && targetId) {
            newEdges.push({
              id: `edge_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              source: sourceId,
              target: targetId,
              sourceHandle: tpl.sourceHandle,
              targetHandle: tpl.targetHandle,
            });
          }
        });

        // 批量添加
        const store = useCanvasStore.getState();
        store.setNodes([...store.nodes, ...newNodes]);
        store.setEdges([...store.edges, ...newEdges]);
        message.success(`📦 已从模板恢复「${asset.name}」（${newNodes.length} 个节点）`);
      }
    },
  }), [reactFlowInstance, addNode]);

  const onSelectionContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length < 2) {
      // 单选一个 GroupNode → 显示解散选项
      if (selectedNodes.length === 1 && selectedNodes[0].type === 'nodeGroup') {
        setGroupMenuConfig({ x: event.clientX, y: event.clientY, selectedNodeIds: [], dissolveGroupId: selectedNodes[0].id });
        return;
      }
      return;
    }
    // 不允许已在组内的节点再次编组
    if (selectedNodes.some(n => n.parentNode)) return;
    setGroupMenuConfig({ x: event.clientX, y: event.clientY, selectedNodeIds: selectedNodes.map(n => n.id) });
  }, [nodes]);

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

  // Ctrl+B 快捷键：单节点静音 / 多选创建静音组
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'b')) return;
      e.preventDefault();
      const selected = nodes.filter(n => n.selected && n.type !== 'nodeGroup');
      if (selected.length === 0) return;
      if (selected.length === 1) {
        // 单节点：切换自身 _muted
        updateNodeData(selected[0].id, { _muted: !selected[0].data._muted });
      } else {
        // 多选：创建静音组
        const ids = selected.filter(n => !n.parentNode).map(n => n.id);
        if (ids.length >= 2) {
          const gid = createGroup(ids, '节点组');
          if (gid) {
            updateNodeData(gid, { _muted: true });
            ids.forEach(nid => updateNodeData(nid, { _muted: true }));
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nodes, updateNodeData, createGroup]);

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
        closeGroupMenu();
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

  // Ctrl+S 快捷键：快速保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

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
      // 🌟 先收集所有 running 节点 ID（在同步上下文中，避免竞态）
      const runningNodeIds = nodes
        .filter(n => nodeRunStatus[n.id] === 'running')
        .map(n => n.id);

      // 立刻停掉 DAG 引擎 + 标记所有 running 节点为 error
      setGlobalRunning(false);
      runningNodeIds.forEach(nodeId => setNodeStatus(nodeId, 'error'));

      // 异步下发 interrupt 指令切断后端任务（fire-and-forget，不阻塞 UI）
      if (runningNodeIds.length > 0) {
        Promise.allSettled(
          runningNodeIds.map(nodeId => apiClient.post(`/interrupt/${nodeId}`))
        ).then(results => {
          const ok = results.filter(r => r.status === 'fulfilled').length;
          message.info(`🛑 全局急刹车完成！(${ok}/${runningNodeIds.length} 个后端任务已中止)`);
        });
      } else {
        message.info("🛑 全局流水线已急刹车！");
      }
      return;
    }
    if (nodes.length === 0) return message.warning("画布太空了，先添点节点吧！");

    resetAllNodeStatus(nodes);

    // 全局运行前，清空所有节点的旧数据，防止被动节点误判
    nodes.forEach(node => {
      if (node.type === 'display') {
        updateNodeData(node.id, { incoming_data: null, result: null });
      }
    });

    setGlobalRunning(true);
    message.success("🚀 漫剧工业流水线，启动！");
  };

  // ================= 🌟 核心新增：智能断点续跑 =================
  const handleResumeRun = () => {
    if (isGlobalRunning) return;
    if (nodes.length === 0) return message.warning("画布太空了，先添点节点吧！");

    const hasSuccessNode = nodes.some(n => nodeRunStatus[n.id] === 'success');
    if (!hasSuccessNode) {
      // 没有任何已成功节点，等同于全新运行
      resetAllNodeStatus(nodes);
      setGlobalRunning(true);
      message.success("🚀 无断点记录，全新启动！");
      return;
    }

    // 智能重置：保留 success 节点，error/running/idle 全部洗为 idle
    smartResetNodeStatus(nodes);

    // 对已成功的节点，重新向下游推送数据（确保下游 incoming_data 不丢失）
    nodes.forEach(node => {
      if (nodeRunStatus[node.id] === 'success') {
        const outData = node.data.result || node.data.asset?.data || node.data.incoming_data;
        if (outData) {
          edges.filter(e => e.source === node.id).forEach(edge => {
            const targetStatus = nodeRunStatus[edge.target];
            // 只向非 success 的下游推送
            if (targetStatus !== 'success') {
              updateNodeData(edge.target, { incoming_data: outData });
            }
          });
        }
      }
    });

    setGlobalRunning(true);
    message.success("⚡ 断点续跑启动！已跳过成功节点");
  };

  // ================= 连线类型校验 =================
  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    const sourceType = getHandleDataType(sourceNode.type, connection.sourceHandle ?? undefined, sourceNode.data, 'source');
    const targetType = getHandleDataType(targetNode.type, connection.targetHandle ?? undefined, targetNode.data, 'target');

    return areTypesCompatible(sourceType, targetType);
  }, [nodes]);

  // 判断是否有可续跑的断点（有 success 且有非 success 的节点，但不能有 running 的）
  const hasBreakpoint = !isGlobalRunning && nodes.some(n => nodeRunStatus[n.id] === 'success') && nodes.some(n => {
    const s = nodeRunStatus[n.id];
    return s === 'error' || s === 'idle';
  }) && !nodes.some(n => nodeRunStatus[n.id] === 'running');

  // ================= 🌟 核心大脑：DAG 拓扑自动驱动引擎 =================
  const dagTickRef = useRef(0);
  const fissionDoneRef = useRef<Set<string>>(new Set()); // 记录已裂变过的节点，避免重复裂变
  useEffect(() => {
    if (!isGlobalRunning) {
      dagTickRef.current = 0;
      fissionDoneRef.current.clear();
      return;
    }

    // ── 裂变检测：在常规 tick 之前，检查是否有 success 节点需要裂变 ──
    for (const node of nodes) {
      if (node.type === 'nodeGroup') continue;
      const status = nodeRunStatus[node.id] || 'idle';
      if (status !== 'success') continue;
      if (fissionDoneRef.current.has(node.id)) continue;

      const result = node.data?.result;
      if (result && typeof result === 'object' && result._fission && Array.isArray(result.items) && result.items.length > 1) {
        const expectedCountRaw = node.data?._fissionExpectedCount;
        const expectedCount = Number.isFinite(Number(expectedCountRaw)) ? Number(expectedCountRaw) : null;
        const actualCount = result.items.length;

        // 三次保险（执行侧硬闸）：裂变前最终校验数量
        if (expectedCount !== null && actualCount !== expectedCount) {
          fissionDoneRef.current.add(node.id); // 避免重复告警
          message.warning(`裂变执行已阻断：节点期望 ${expectedCount} 条，实际 ${actualCount} 条`, 4);
          console.warn(`[DAG 引擎] 裂变阻断，node=${node.id}, expected=${expectedCount}, actual=${actualCount}`);
          continue;
        }

        // 标记为已裂变，防止下一轮 tick 重复
        fissionDoneRef.current.add(node.id);
        console.log(`[DAG 引擎] 🔀 检测到裂变信号，节点 ${node.id} 裂变 ${actualCount} 份`);

        const clonedRootIds = executeFission(node.id, result.items);

        // 为原始模板节点（第一个）注入第一个 item
        const downEdges = edges.filter(e => e.source === node.id);
        for (const edge of downEdges) {
          updateNodeData(edge.target, { incoming_data: result.items[0] });
        }

        // 为裂变出的克隆节点注入对应的 item（跳过第一个，它是原始节点）
        for (let i = 1; i < clonedRootIds.length; i++) {
          updateNodeData(clonedRootIds[i], { incoming_data: result.items[i] });
        }

        message.info(`🔀 裂变完成！已创建 ${actualCount} 个并行分支`, 3);
        // 裂变后跳出，让下一轮 tick 自然触发裂变出的节点
        return;
      }
    }

    // 预计算被静音的组
    const mutedGroupIds = new Set(
      nodes.filter(n => n.type === 'nodeGroup' && n.data._muted).map(n => n.id)
    );

    let allDone = true;
    let hasRunning = false;
    let newlyTriggered = false;
    let hasError = false;

    nodes.forEach((node) => {
      // 跳过 group 节点本身（不参与 DAG 执行）
      if (node.type === 'nodeGroup') return;

      const status = nodeRunStatus[node.id] || 'idle';

      // 被静音组内的节点 或 单节点静音 → 直接旁路
      const isNodeMuted = !!node.data?._muted || (node.parentNode && mutedGroupIds.has(node.parentNode));
      if (isNodeMuted) {
        if (status === 'idle') {
          setNodeStatus(node.id, 'success');
          // 透传上游数据给下游
          const outEdges = edges.filter(e => e.source === node.id);
          const inEdges = edges.filter(e => e.target === node.id);
          if (inEdges.length > 0 && outEdges.length > 0) {
            const srcNode = nodes.find(n => n.id === inEdges[0].source);
            const passthrough = srcNode?.data.result || srcNode?.data.incoming_data;
            if (passthrough) outEdges.forEach(e => updateNodeData(e.target, { incoming_data: passthrough }));
          }
        }
        return;
      }

      if (status === 'error') hasError = true;
      if (status === 'running') hasRunning = true;
      if (status !== 'success') allDone = false;

      if (status === 'idle') {
        const incomingEdges = edges.filter((e) => e.target === node.id);
        const isReady = incomingEdges.length === 0
          ? true  // 源头节点（无上游）直接就绪
          : incomingEdges.every((e) => nodeRunStatus[e.source] === 'success');

        if (isReady && !hasError) {
          console.log(`[DAG 引擎] 条件达成，触发节点: ${node.id}`);
          setNodeStatus(node.id, 'running');
          updateNodeData(node.id, { _runSignal: Date.now() });
          newlyTriggered = true;
        }
      }
    });

    dagTickRef.current += 1;

    if (hasError) {
      setGlobalRunning(false);
      message.error("🚨 有节点执行失败，流水线已暂停。可点击「断点续跑」从失败处重试！", 4);
    } else if (allDone && nodes.length > 0) {
      setGlobalRunning(false);
      message.success("✨ 太棒了！全部流水线节点执行完毕！", 3);
    } else if (!newlyTriggered && !hasRunning && !allDone && dagTickRef.current > 1) {
      // 只在第二个 tick 之后才判定死锁，避免首次 tick 的竞态误判
      message.error("🚨 检测到死锁或有未连接的节点孤岛，执行强行终止！");
      setGlobalRunning(false);
    }
  }, [isGlobalRunning, nodeRunStatus, nodes, edges, updateNodeData, setNodeStatus, setGlobalRunning, executeFission]);

  // 🎬 一键漫剧：自动创建分镜大师→生图→Display 流水线
  const createComicPipeline = useCallback((config: typeof comicConfig) => {
    if (!config.story.trim()) { message.warning('请输入故事或创意描述'); return; }

    saveHistory();

    const baseX = 100;
    const baseY = 100;
    const gapX = 420;

    // 1. 创建分镜大师节点（GenerateNode, chat 模式, 裂变开启）
    const storyboardId = getId();
    const storyboardSystemPrompt = `你是一位专业的分镜师和 Prompt Engineer。用户会给你一段故事或创意描述，你需要将其拆解为恰好 ${config.panelCount} 个分镜画面。

硬性要求（必须全部满足）：
1. 输出语言：每个分镜必须是英文图片提示词（Prompt）
2. 每个分镜需包含：主体、动作、表情、场景、光影、镜头构图、画面细节
3. ${config.style ? `整体画风: ${config.style}` : '整体画风需统一且与故事匹配'}
4. 目标平台: ${config.platform}
5. 输出数量必须严格等于 ${config.panelCount} 条，不能多也不能少
6. 输出格式必须是“纯 JSON 数组”，数组元素必须是字符串
7. 禁止输出 Markdown 代码块（例如 \`\`\`json）
8. 禁止输出任何解释、标题、前后缀文本，只能输出 JSON 数组本体
9. 如果你不确定，也必须输出合法 JSON 数组，不要输出自然语言

输出示例（仅示例，不可照抄）：
["Cinematic anime frame, ...", "Cinematic anime frame, ..."]`;

    const storyboardNode = {
      id: storyboardId,
      type: 'generate',
      position: { x: baseX, y: baseY },
      data: {
        label: '🎬 分镜大师',
        mode: 'chat',
        prompt: config.story,
        _fissionEnabled: true,
        _fissionExpectedCount: config.panelCount,
        _customLabel: true,
        selectedRole: '_free_agent',
        params: {},
        _systemPromptOverride: storyboardSystemPrompt,
      },
      style: { width: 360, height: 420 },
    };

    // 2. 创建生图节点（GenerateNode, text_to_image 模式, 作为裂变模板）
    const imageGenId = getId();
    const imageGenNode = {
      id: imageGenId,
      type: 'generate',
      position: { x: baseX + gapX, y: baseY },
      data: {
        label: '🖼️ 分镜绘图',
        mode: 'text_to_image',
        prompt: '',
        _customLabel: true,
        selectedRole: '_free_agent',
        params: {},
      },
      style: { width: 360, height: 380 },
    };

    // 3. 创建 Display 节点
    const displayId = getId();
    const displayNode = {
      id: displayId,
      type: 'display',
      position: { x: baseX + gapX * 2, y: baseY },
      data: { label: '📺 分镜预览', _customLabel: true },
      style: { width: 300, height: 300 },
    };

    // 4. 创建连线
    const edge1 = {
      id: `edge_comic_1_${Date.now()}`,
      source: storyboardId,
      target: imageGenId,
      sourceHandle: 'out',
      targetHandle: 'text',
    };
    const edge2 = {
      id: `edge_comic_2_${Date.now()}`,
      source: imageGenId,
      target: displayId,
      sourceHandle: 'out',
      targetHandle: 'in',
    };

    // 批量添加
    const store = useCanvasStore.getState();
    store.setNodes([...store.nodes, storyboardNode as any, imageGenNode as any, displayNode as any]);
    store.setEdges([...store.edges, edge1, edge2]);

    // 关闭 Modal
    setComicModalOpen(false);

    message.success('🎬 漫剧流水线已创建！请为两个大脑节点选择 Key/Model，然后点击「运行全局」');
  }, [saveHistory, addNode]);

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

          {hasBreakpoint && (
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleResumeRun}
              type="primary"
              style={{ fontWeight: 'bold', background: '#faad14', borderColor: '#faad14' }}
            >
              断点续跑
            </Button>
          )}

          <Button
            onClick={() => setComicModalOpen(true)}
            style={{ fontWeight: 'bold', borderColor: '#f59e0b', color: '#f59e0b' }}
          >
            🎬 一键漫剧
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
              <AssetLibrary
                projectId={Number(id)}
                onAddToCanvas={(asset) => {
                  const position = reactFlowInstance?.screenToFlowPosition({
                    x: (window.innerWidth - 320) / 2 + 320,
                    y: window.innerHeight / 2,
                  }) ?? { x: 300, y: 200 };
                  addNode({
                    id: getId(),
                    type: 'loadAsset',
                    position,
                    data: { label: asset.name, asset }
                  });
                  message.success(`「${asset.name}」已发送到画布`);
                }}
              />
            </div>
          </div>
        </Sider>

        <Content ref={(el: HTMLDivElement | null) => { (reactFlowWrapper as any).current = el; canvasDrop(el); }} style={{ background: '#f0f2f5', position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            fitView
            zoomOnDoubleClick={false}
            onPaneClick={onPaneClick}
            onNodeClick={closeMenu}
            onPaneContextMenu={onPaneContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onNodeContextMenu={(event, node) => {
              if (node.type === 'nodeGroup') {
                event.preventDefault();
                setGroupMenuConfig({ x: event.clientX, y: event.clientY, selectedNodeIds: [], dissolveGroupId: node.id });
              }
            }}
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

          {/* 节点组右键菜单 */}
          {groupMenuConfig && (
            <div
              style={{
                position: 'fixed', left: groupMenuConfig.x, top: groupMenuConfig.y, zIndex: 9999,
                background: '#fff', boxShadow: '0 12px 24px rgba(0,0,0,0.2)',
                borderRadius: 8, width: 180, border: '1px solid #d9d9d9',
                animation: 'zoom-in 0.15s ease-out', overflow: 'hidden', padding: '4px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {groupMenuConfig.selectedNodeIds.length > 0 && (
                <div
                  onClick={() => { createGroup(groupMenuConfig.selectedNodeIds, '节点组'); closeGroupMenu(); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#e6f4ff'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Text strong style={{ fontSize: 13 }}>📦 创建节点组</Text>
                </div>
              )}
              {groupMenuConfig.dissolveGroupId && (
                <div
                  onClick={() => { dissolveGroup(groupMenuConfig.dissolveGroupId!); closeGroupMenu(); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#fff1f0'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Text strong style={{ fontSize: 13, color: '#ff4d4f' }}>🔓 解散节点组</Text>
                </div>
              )}
            </div>
          )}
        </Content>
      </Layout>

      {/* 🎬 一键漫剧 Modal */}
      <Modal
        title="🎬 一键漫剧"
        open={comicModalOpen}
        onCancel={() => setComicModalOpen(false)}
        onOk={() => createComicPipeline(comicConfig)}
        okText="创建流水线"
        cancelText="取消"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>故事 / 创意描述</Text>
            <Input.TextArea
              rows={4}
              placeholder="输入一段故事、一句创意，或一个场景描述..."
              value={comicConfig.story}
              onChange={e => setComicConfig(prev => ({ ...prev, story: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>分镜数量</Text>
              <Select
                value={comicConfig.panelCount}
                onChange={v => setComicConfig(prev => ({ ...prev, panelCount: v }))}
                style={{ width: '100%' }}
                options={[
                  { label: '4 格', value: 4 },
                  { label: '6 格', value: 6 },
                  { label: '8 格', value: 8 },
                  { label: '12 格', value: 12 },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>目标平台</Text>
              <Select
                value={comicConfig.platform}
                onChange={v => setComicConfig(prev => ({ ...prev, platform: v }))}
                style={{ width: '100%' }}
                options={[
                  { label: '通用', value: '通用' },
                  { label: '抖音', value: '抖音' },
                  { label: '快手', value: '快手' },
                  { label: '小红书', value: '小红书' },
                  { label: 'B站', value: 'B站' },
                ]}
              />
            </div>
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>画风描述（可选）</Text>
            <Input
              placeholder="如：日漫风格、赛博朋克、水墨画..."
              value={comicConfig.style}
              onChange={e => setComicConfig(prev => ({ ...prev, style: e.target.value }))}
            />
          </div>
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#ad6800' }}>
            💡 创建后需要为分镜大师和分镜绘图两个节点分别选择 Key/Model，然后点击「运行全局」即可自动裂变并发生图
          </div>
        </div>
      </Modal>
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