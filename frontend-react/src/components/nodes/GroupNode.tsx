import React, { memo, useState, useRef, useEffect } from 'react';
import { type NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import { Typography, Input, Tag, Tooltip, message } from 'antd';
import {
  CompressOutlined, ExpandOutlined,
  PlayCircleOutlined, StopOutlined,
  EyeOutlined, EyeInvisibleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useCanvasStore } from '../../stores/canvasStore';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';
import { nodeRegistry } from '../../utils/nodeRegistry';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';

const { Text } = Typography;

const GroupNode = memo((props: NodeProps) => {
  const { id, data, selected } = props;
  const { nodes, edges, updateNodeData, nodeRunStatus, setNodeStatus, isGlobalRunning } = useCanvasStore();
  const { setNodes } = useReactFlow();
  const { id: projectId } = useParams<{ id: string }>();
  const fetchAssets = useAssetLibraryStore(state => state.fetchAssets);

  const [savingTemplate, setSavingTemplate] = useState(false);

  const collapsed = !!data?._collapsed;
  const muted = !!data?._muted;
  const groupRunning = !!data?._isGroupRunning;
  const nodeColor = data?.customColor || '#8b5cf6';

  // 子节点 ID 列表
  const childNodeIds: string[] = nodes.filter(n => n.parentNode === id).map(n => n.id);

  // ── 标题编辑 ──
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const inputRef = useRef<any>(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus({ cursor: 'all' }); }, [editing]);
  const handleLabelDblClick = (e: React.MouseEvent) => { e.stopPropagation(); setEditLabel(data?.label || ''); setEditing(true); };
  const handleLabelSave = () => { const t = editLabel.trim(); if (t && t !== data?.label) updateNodeData(id, { label: t, _customLabel: true }); setEditing(false); };

  // ── 折叠/展开 ──
  const COLLAPSED_W = 220;
  const COLLAPSED_H = 50;
  const handleToggleCollapse = () => {
    if (!collapsed) {
      setNodes(nds => nds.map(n => {
        if (n.id === id) {
          return { ...n, style: { ...n.style, width: COLLAPSED_W, height: COLLAPSED_H }, data: { ...n.data, _collapsed: true, _expandedSize: { width: n.style?.width || 500, height: n.style?.height || 400 } } };
        }
        if (n.parentNode === id) return { ...n, hidden: true };
        return n;
      }));
    } else {
      const size = data._expandedSize || { width: 500, height: 400 };
      setNodes(nds => nds.map(n => {
        if (n.id === id) return { ...n, style: { ...n.style, width: size.width, height: size.height }, data: { ...n.data, _collapsed: false } };
        if (n.parentNode === id) return { ...n, hidden: false };
        return n;
      }));
    }
  };

  // ── 静音切换 ──
  const handleToggleMute = () => {
    const next = !muted;
    updateNodeData(id, { _muted: next });
    childNodeIds.forEach(cid => updateNodeData(cid, { _muted: next }));
  };

  // Ctrl+B 快捷键：选中时切换静音
  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        const next = !muted;
        updateNodeData(id, { _muted: next });
        childNodeIds.forEach(cid => updateNodeData(cid, { _muted: next }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, muted, id, updateNodeData]);

  // ── 组级运行 ──
  const handleGroupRun = () => {
    if (groupRunning) {
      // 停止：中断组内所有 running 节点
      childNodeIds.forEach(cid => { if (nodeRunStatus[cid] === 'running') setNodeStatus(cid, 'error'); });
      updateNodeData(id, { _isGroupRunning: false });
      return;
    }
    // 重置组内节点状态并启动
    childNodeIds.forEach(cid => setNodeStatus(cid, 'idle'));
    updateNodeData(id, { _isGroupRunning: true });
  };

  // 💾 存为模板：将组内节点+连线保存为可复用模板资产
  const handleSaveAsTemplate = async () => {
    const groupNode = nodes.find(n => n.id === id);
    if (!groupNode) return;

    const childNodes = nodes.filter(n => n.parentNode === id);
    if (childNodes.length === 0) { message.warning('组内没有节点'); return; }

    const childSet = new Set(childNodes.map(n => n.id));
    const childEdges = edges.filter(e => childSet.has(e.source) && childSet.has(e.target));

    // 构建节点索引映射
    const idToIndex: Record<string, number> = {};
    const templateNodes = childNodes.map((n, i) => {
      idToIndex[n.id] = i;
      const { result, incoming_data, _runSignal, _fissionIndex, _fissionSource, ...config } = n.data || {};
      return {
        type: n.type,
        relativePosition: n.position,
        config,
      };
    });

    const templateEdges = childEdges.map(e => ({
      sourceIndex: idToIndex[e.source],
      targetIndex: idToIndex[e.target],
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
    }));

    const templateName = data?.label || '节点模板';

    setSavingTemplate(true);
    try {
      await apiClient.post('/assets/', {
        type: 'node_template',
        name: templateName,
        description: `包含 ${childNodes.length} 个节点的模板`,
        tags: ['NodeTemplate'],
        data: { nodes: templateNodes, edges: templateEdges },
        project_id: projectId ? Number(projectId) : null,
      });
      message.success('💾 节点组已存为模板资产');
      fetchAssets(projectId ? Number(projectId) : undefined);
    } catch (e: any) {
      message.error(`保存失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSavingTemplate(false);
    }
  };

  // 组级 DAG tick
  useEffect(() => {
    if (!groupRunning) return;
    const childSet = new Set(childNodeIds);
    const childEdges = edges.filter(e => childSet.has(e.source) && childSet.has(e.target));
    let allDone = true, hasError = false;

    childNodeIds.forEach(cid => {
      const status = nodeRunStatus[cid] || 'idle';
      if (status === 'error') hasError = true;
      if (status !== 'success') allDone = false;

      if (status === 'idle') {
        const incoming = childEdges.filter(e => e.target === cid);
        // 也检查组外进入的边
        const externalIncoming = edges.filter(e => e.target === cid && !childSet.has(e.source));
        const ready = incoming.every(e => nodeRunStatus[e.source] === 'success')
          && externalIncoming.every(e => nodeRunStatus[e.source] === 'success');
        if ((incoming.length === 0 && externalIncoming.length === 0) || ready) {
          if (!hasError) {
            setNodeStatus(cid, 'running');
            updateNodeData(cid, { _runSignal: Date.now() });
          }
        }
      }
    });

    if (hasError || (allDone && childNodeIds.length > 0)) {
      updateNodeData(id, { _isGroupRunning: false });
    }
  }, [groupRunning, nodeRunStatus, nodes, edges]);

  // ── 渲染 ──
  const borderColor = muted ? '#94a3b8' : nodeColor;
  const bgAlpha = muted ? 'rgba(148,163,184,0.06)' : `${nodeColor}0a`;

  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected && !collapsed}
        minWidth={220}
        minHeight={100}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, border: 'none', background: nodeColor }}
      />

      <div style={{
        width: '100%', height: '100%',
        background: bgAlpha,
        border: `2px ${muted ? 'dashed' : 'solid'} ${borderColor}`,
        borderRadius: 12,
        opacity: muted ? 0.6 : 1,
        display: 'flex', flexDirection: 'column',
        transition: 'border-color 0.3s, opacity 0.3s',
      }}>
        {/* 标题栏 */}
        <div className="custom-drag-handle" style={{
          padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: `${nodeColor}15`, borderBottom: `1px solid ${nodeColor}30`,
          borderTopLeftRadius: 10, borderTopRightRadius: 10, cursor: 'grab', flexShrink: 0,
        }}>
          {editing ? (
            <Input ref={inputRef} className="nodrag" size="small" value={editLabel}
              onChange={e => setEditLabel(e.target.value)} onPressEnter={handleLabelSave} onBlur={handleLabelSave}
              style={{ fontSize: 13, fontWeight: 700, padding: '0 4px', height: 22, width: 120 }} />
          ) : (
            <Text onDoubleClick={handleLabelDblClick} style={{
              fontSize: 13, fontWeight: 800, color: '#1e293b', cursor: 'text', userSelect: 'none',
              letterSpacing: '0.5px', fontFamily: '"SF Pro Display", -apple-system, sans-serif',
            }}>
              {data?.label || '节点组'} <span style={{ fontWeight: 400, color: '#64748b', fontSize: 11 }}>({childNodeIds.length})</span>
            </Text>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {muted && <Tag color="default" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>MUTED</Tag>}
            <Tooltip title="存为模板资产">
              <div className="nodrag" onClick={handleSaveAsTemplate}
                style={{ cursor: savingTemplate ? 'wait' : 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
                <SaveOutlined style={{ color: savingTemplate ? '#0ea5e9' : '#64748b', fontSize: 12 }} />
              </div>
            </Tooltip>
            <Tooltip title={muted ? '取消静音' : '静音（旁路）'}>
              <div className="nodrag" onClick={handleToggleMute}
                style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
                {muted ? <EyeInvisibleOutlined style={{ color: '#94a3b8', fontSize: 12 }} /> : <EyeOutlined style={{ color: '#64748b', fontSize: 12 }} />}
              </div>
            </Tooltip>
            <Tooltip title={muted ? '静音中，无法运行' : groupRunning ? '停止组运行' : '运行本组'}>
              <div className="nodrag" onClick={() => { if (!muted && !isGlobalRunning) handleGroupRun(); }}
                style={{ cursor: (isGlobalRunning || muted) ? 'not-allowed' : 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)', opacity: (isGlobalRunning || muted) ? 0.4 : 1 }}>
                {groupRunning ? <StopOutlined style={{ color: '#ef4444', fontSize: 12 }} /> : <PlayCircleOutlined style={{ color: '#10b981', fontSize: 12 }} />}
              </div>
            </Tooltip>
            <Tooltip title={collapsed ? '展开' : '折叠'}>
              <div className="nodrag" onClick={handleToggleCollapse}
                style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
                {collapsed ? <ExpandOutlined style={{ color: '#64748b', fontSize: 12 }} /> : <CompressOutlined style={{ color: '#64748b', fontSize: 12 }} />}
              </div>
            </Tooltip>
          </div>
        </div>

        {/* 折叠时显示摘要 */}
        {collapsed && (
          <div style={{ padding: '4px 12px', fontSize: 12, color: '#64748b' }}>
            包含 {childNodeIds.length} 个节点
          </div>
        )}
      </div>
    </>
  );
});

nodeRegistry.register({
  type: 'nodeGroup',
  displayName: '📦 节点组',
  component: GroupNode,
  defaultData: { label: '节点组', _collapsed: false, _muted: false, _isGroupRunning: false },
});

export default GroupNode;
