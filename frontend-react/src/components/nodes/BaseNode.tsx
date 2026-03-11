// frontend-react/src/components/nodes/BaseNode.tsx
import React, { memo } from 'react';
import { type NodeProps, NodeResizer } from 'reactflow';
import { Typography, ColorPicker, ConfigProvider, theme } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import { useCanvasStore } from '../../stores/canvasStore';

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

export const BaseNode = memo((props: NodeProps) => {
  const { id, selected, data, children } = props;
  const { updateNodeData, nodeRunStatus } = useCanvasStore();

  // 🌟 动态订阅执行状态
  const status = nodeRunStatus[id] || 'idle';

  const nodeColor = data?.customColor || '#0ea5e9';
  const bgColor = hexToRgba('#ffffff', 0.85);
  let glowColor = hexToRgba(nodeColor, 0.15);

  // 🌟 极客风 UI 状态机融合
  let borderStyle = selected ? `1px solid ${nodeColor}` : `1px solid rgba(0,0,0,0.08)`;
  let glowShadow = selected
    ? `0 0 0 1px ${nodeColor}, 0 4px 20px ${glowColor}`
    : '0 4px 24px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255,255,255,0.6)';

  if (status === 'running') {
    borderStyle = `2px solid #0ea5e9`; // 蓝光
    glowShadow = `0 0 15px rgba(14, 165, 233, 0.6)`;
  } else if (status === 'success') {
    borderStyle = `2px solid #10b981`; // 绿光
    glowShadow = `0 0 15px rgba(16, 185, 129, 0.5)`;
  } else if (status === 'error') {
    borderStyle = `2px solid #ef4444`; // 红光
    glowShadow = `0 0 15px rgba(239, 68, 68, 0.6)`;
  }

  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected}
        minWidth={360} // 🌟 核心：把默认底线调大到 360，摆脱拥挤感
        minHeight={160}
        keepAspectRatio={false}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, background: nodeColor, border: 'none' }}
      />

      <div
        className="comfyforge-node-container"
        style={{
          width: '100%', height: '100%', // 🌟 绝对防御：必须是 100%，誓死捍卫 ReactFlow 的 NodeResizer 控制权！
          minWidth: 360, minHeight: 160,
          background: bgColor, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: borderStyle, borderRadius: '8px', boxShadow: glowShadow,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          // ⚠️ 注意：不要在这里对 all 进行过渡，否则拖拽缩放时会有极其难受的卡顿果冻效应
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease'
        }}
      >
        <div className="custom-drag-handle" style={{
          background: `linear-gradient(90deg, ${hexToRgba(nodeColor, 0.1)} 0%, ${hexToRgba(nodeColor, 0.02)} 100%)`,
          padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${hexToRgba(nodeColor, 0.2)}`, cursor: 'grab', flexShrink: 0
        }}>
          <Text style={{
            fontSize: 13, color: '#1e293b', margin: 0, fontWeight: 800,
            letterSpacing: '0.5px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', textTransform: 'uppercase'
          }}>
            {data?.label || 'SYS.NODE.UNNAMED'}
          </Text>

          <ColorPicker
            size="small" value={nodeColor}
            onChangeComplete={(color) => updateNodeData(id, { customColor: color.toHexString() })}
          >
            <div style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.04)', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
              <BgColorsOutlined style={{ color: '#64748b', fontSize: 10 }} />
            </div>
          </ColorPicker>
        </div>

        <div className="nodrag" style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <ConfigProvider
            theme={{
              algorithm: theme.defaultAlgorithm,
              token: {
                colorPrimary: nodeColor, colorBgContainer: '#ffffff', colorBorder: '#e2e8f0', fontFamily: 'monospace',
              }
            }}
            getPopupContainer={(triggerNode) => triggerNode ? (triggerNode.parentNode as HTMLElement) || document.body : document.body}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
              {children}
            </div>
          </ConfigProvider>
        </div>
      </div>
    </>
  );
});