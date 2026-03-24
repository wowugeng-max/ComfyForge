// frontend-react/src/components/nodes/BaseNode.tsx
import React, { memo, useState, useRef, useEffect } from 'react';
import { type NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import { Typography, ColorPicker, ConfigProvider, theme, Input, message, Modal } from 'antd';
import { BgColorsOutlined, CompressOutlined, ExpandOutlined, SettingOutlined, SaveOutlined } from '@ant-design/icons';
import { useCanvasStore } from '../../stores/canvasStore';
import { useAssetLibraryStore } from '../../stores/assetLibraryStore';
import { useParams } from 'react-router-dom';
import apiClient from '../../api/client';

const { Text } = Typography;

const hexToRgba = (hex: string, alpha: number) => {
  let c: any;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) c = [c, c, c, c, c, c];
    c = '0x' + c.join('');
    return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
};

export const BaseNode = memo((props: NodeProps & { onOpenConfig?: () => void }) => {
  const { id, selected, data, children } = props;
  const { updateNodeData, nodeRunStatus, nodes } = useCanvasStore();
  const { setNodes } = useReactFlow();
  const { id: projectId } = useParams<{ id: string }>();
  const fetchAssets = useAssetLibraryStore(state => state.fetchAssets);

  const [savingNodeAsset, setSavingNodeAsset] = useState(false);

  // 💾 存为资产：将节点配置保存到资产库
  const handleSaveAsAsset = async () => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    // 过滤掉运行时数据，只保留配置
    const { result, incoming_data, _runSignal, _fissionIndex, _fissionSource, ...config } = data || {};

    const assetName = data?.label || data?._customLabel || `节点配置_${node.type}`;

    setSavingNodeAsset(true);
    try {
      await apiClient.post('/assets/', {
        type: 'node_config',
        name: assetName,
        description: `节点类型: ${node.type}`,
        tags: ['NodeConfig', node.type || ''],
        data: { nodeType: node.type, config },
        project_id: projectId ? Number(projectId) : null,
      });
      message.success('💾 节点配置已存为资产');
      fetchAssets(projectId ? Number(projectId) : undefined);
    } catch (e: any) {
      message.error(`保存失败: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setSavingNodeAsset(false);
    }
  };

  const status = nodeRunStatus[id] || 'idle';

  const nodeColor = data?.customColor || '#0ea5e9';
  const bgColor = hexToRgba('#ffffff', 0.85);
  let glowColor = hexToRgba(nodeColor, 0.15);

  let borderStyle = selected ? `1px solid ${nodeColor}` : `1px solid rgba(0,0,0,0.08)`;
  let glowShadow = selected
    ? `0 0 0 1px ${nodeColor}, 0 4px 20px ${glowColor}`
    : '0 4px 24px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255,255,255,0.6)';

  if (status === 'running') {
    borderStyle = `2px solid #0ea5e9`;
    glowShadow = `0 0 15px rgba(14, 165, 233, 0.6)`;
  } else if (status === 'success') {
    borderStyle = `2px solid #10b981`;
    glowShadow = `0 0 15px rgba(16, 185, 129, 0.5)`;
  } else if (status === 'error') {
    borderStyle = `2px solid #ef4444`;
    glowShadow = `0 0 15px rgba(239, 68, 68, 0.6)`;
  }

  const nodeMuted = !!data?._muted;

  // 🌟 核心防御：动态读取节点的最小尺寸限制，默认设为 360x380 黄金护城河！
  // 任何用户的鼠标都绝对无法把节点压扁到这个尺寸以下！
  const minW = data?.minWidth || 150;
  const minH = data?.minHeight || 60;

  const collapsed = !!data?._collapsed;
  const COLLAPSED_HEIGHT = 42;

  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus({ cursor: 'all' });
  }, [editing]);

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLabel(data?.label || '');
    setEditing(true);
  };

  const handleLabelSave = () => {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== data?.label) updateNodeData(id, { label: trimmed, _customLabel: true });
    setEditing(false);
  };

  const handleToggleCollapse = () => {
    if (!collapsed) {
      // 折叠：保存当前尺寸，然后缩小
      setNodes(nds => nds.map(n => {
        if (n.id !== id) return n;
        const prevW = n.style?.width || n.width || 360;
        const prevH = n.style?.height || n.height || 380;
        return {
          ...n,
          style: { ...n.style, width: prevW, height: COLLAPSED_HEIGHT },
          data: { ...n.data, _collapsed: true, _prevWidth: prevW, _prevHeight: prevH },
        };
      }));
    } else {
      // 展开：恢复保存的尺寸
      setNodes(nds => nds.map(n => {
        if (n.id !== id) return n;
        return {
          ...n,
          style: { ...n.style, width: n.data._prevWidth || 360, height: n.data._prevHeight || 380 },
          data: { ...n.data, _collapsed: false },
        };
      }));
    }
  };

  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected && !collapsed}
        minWidth={minW}
        minHeight={minH}
        keepAspectRatio={false}
        handleStyle={{
          width: 10, height: 10, borderRadius: 2, border: 'none',
          background: nodeColor,
        }}
      />

      <div
        className="comfyforge-node-container"
        style={{
          width: '100%', height: '100%',
          background: bgColor, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: nodeMuted ? `2px dashed #94a3b8` : borderStyle, borderRadius: '12px', boxShadow: nodeMuted ? 'none' : glowShadow,
          display: 'flex', flexDirection: 'column',
          position: 'relative',
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease',
          transform: 'translateZ(0)',
          opacity: nodeMuted ? 0.5 : 1,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <div className="custom-drag-handle" style={{
          background: `linear-gradient(90deg, ${hexToRgba(nodeColor, 0.1)} 0%, ${hexToRgba(nodeColor, 0.02)} 100%)`,
          padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${hexToRgba(nodeColor, 0.2)}`, cursor: 'grab', flexShrink: 0,
          borderTopLeftRadius: '11px', borderTopRightRadius: '11px'
        }}>
          {editing ? (
            <Input
              ref={inputRef}
              className="nodrag"
              size="small"
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onPressEnter={handleLabelSave}
              onBlur={handleLabelSave}
              style={{
                fontSize: 13, fontWeight: 800, padding: '0 4px', height: 22,
                letterSpacing: '0.5px', fontFamily: '"SF Pro Display", -apple-system, sans-serif',
              }}
            />
          ) : (
            <Text
              onDoubleClick={handleLabelDoubleClick}
              style={{
                fontSize: 13, color: '#1e293b', margin: 0, fontWeight: 800,
                letterSpacing: '0.5px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', textTransform: 'uppercase',
                cursor: 'text', userSelect: 'none',
              }}
            >
              {data?.label || 'SYS.NODE.UNNAMED'}
            </Text>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {nodeMuted && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: 1 }}>MUTED</span>}
            <div
              className="nodrag"
              onClick={handleSaveAsAsset}
              title="存为资产"
              style={{ cursor: savingNodeAsset ? 'wait' : 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <SaveOutlined style={{ color: savingNodeAsset ? '#0ea5e9' : '#64748b', fontSize: 10 }} />
            </div>
            {props.onOpenConfig && (
              <div
                className="nodrag"
                onClick={props.onOpenConfig}
                style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <SettingOutlined style={{ color: '#64748b', fontSize: 10 }} />
              </div>
            )}
            <div
              className="nodrag"
              onClick={handleToggleCollapse}
              style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}
            >
              {collapsed
                ? <ExpandOutlined style={{ color: '#64748b', fontSize: 10 }} />
                : <CompressOutlined style={{ color: '#64748b', fontSize: 10 }} />
              }
            </div>
            <ColorPicker
              size="small" value={nodeColor}
              onChangeComplete={(color) => updateNodeData(id, { customColor: color.toHexString() })}
            >
              <div style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
                <BgColorsOutlined style={{ color: '#64748b', fontSize: 10 }} />
              </div>
            </ColorPicker>
          </div>
        </div>

        {!collapsed && (
        <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <ConfigProvider
            theme={{
              algorithm: theme.defaultAlgorithm,
              token: { colorPrimary: nodeColor, colorBgContainer: '#ffffff', colorBorder: '#cbd5e1', fontFamily: 'monospace' }
            }}
            getPopupContainer={(triggerNode) => triggerNode ? (triggerNode.parentNode as HTMLElement) || document.body : document.body}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
              {children}
            </div>
          </ConfigProvider>
        </div>
        )}
      </div>
    </>
  );
});