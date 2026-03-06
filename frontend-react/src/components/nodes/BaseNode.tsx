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
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    c = '0x' + c.join('');
    return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${alpha})`;
  }
  return `rgba(15, 23, 42, ${alpha})`;
};

export const BaseNode = memo((props: NodeProps) => {
  // 拿到 React Flow 传递的真实物理尺寸
  const { id, selected, data, children, width, height } = props;
  const { updateNodeData } = useCanvasStore();

  const nodeColor = data?.customColor || '#0ea5e9';
  const bgColor = hexToRgba('#0f172a', 0.85);
  const glowColor = hexToRgba(nodeColor, 0.4);

  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected}
        minWidth={240}
        minHeight={150}
        // 如果你需要自由改变长宽比，把这里改成 false
        keepAspectRatio={false}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, background: nodeColor, border: 'none' }}
      />

      {/* 🛡️ 真正的响应式外壳：直接应用 width 和 height，如果没有就是 auto */}
      <div
        className="comfyforge-node-container"
        style={{
// 🚀 核心修复：必须直接使用传递过来的像素值！绝对不能用 100%
          width: width ? `${width}px` : 320,
          height: height ? `${height}px` : 'auto',
          background: bgColor,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: selected ? `1px solid ${nodeColor}` : `1px solid rgba(255,255,255,0.1)`,
          borderRadius: '8px',
          boxShadow: selected
            ? `0 0 0 1px ${nodeColor}, 0 0 20px ${glowColor}, inset 0 0 12px rgba(255,255,255,0.05)`
            : '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 顶部把手：高度固定 */}
        <div className="custom-drag-handle" style={{
          background: `linear-gradient(90deg, ${hexToRgba(nodeColor, 0.8)} 0%, ${hexToRgba(nodeColor, 0.2)} 100%)`,
          padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${nodeColor}`, cursor: 'grab',
          flexShrink: 0 // 保证顶部标题栏不被压缩
        }}>
          <Text style={{
            fontSize: 12, color: '#fff', margin: 0, fontWeight: 800,
            letterSpacing: '1px', fontFamily: '"SF Pro Display", -apple-system, sans-serif', textTransform: 'uppercase'
          }}>
            {data?.label || 'SYS.NODE.UNNAMED'}
          </Text>

          <ColorPicker
            size="small" value={nodeColor}
            onChangeComplete={(color) => updateNodeData(id, { customColor: color.toHexString() })}
          >
            <div style={{ cursor: 'pointer', padding: '2px 4px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)' }}>
              <BgColorsOutlined style={{ color: '#fff', fontSize: 10 }} />
            </div>
          </ColorPicker>
        </div>

{/* 🚀 核心修复：把 overflow: 'auto' 改成 'hidden'，并给两层容器都加上 minHeight: 0 */}
        <div className="nodrag" style={{ flex: 1, padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ConfigProvider
            theme={{
              algorithm: theme.darkAlgorithm,
              token: {
                colorPrimary: nodeColor, colorBgContainer: 'rgba(0,0,0,0.4)',
                colorBorder: 'rgba(255,255,255,0.1)', fontFamily: 'monospace',
              }
            }}
            getPopupContainer={(triggerNode) => triggerNode ? (triggerNode.parentNode as HTMLElement) || document.body : document.body}
          >
            {/* 🚀 必须加 minHeight: 0 强行打破内容撑破容器的魔咒 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {children}
            </div>
          </ConfigProvider>
        </div>
      </div>
    </>
  );
});