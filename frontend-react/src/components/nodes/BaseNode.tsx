import React, { memo } from 'react';
import {type NodeProps, NodeResizer } from 'reactflow';
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
  // 从 React Flow 获取物理尺寸
  const { id, selected, data, children, width, height } = props;
  const { updateNodeData } = useCanvasStore();

  const nodeColor = data?.customColor || '#0ea5e9';
  const bgColor = hexToRgba('#0f172a', 0.85);
  const glowColor = hexToRgba(nodeColor, 0.4);

  const BASE_WIDTH = 320;

  // 💥 核心修复引擎：判断是否为刚生成的“初代节点”
  const isInitialRender = !width || !height;

  const currentWidth = width || BASE_WIDTH;
  const scale = currentWidth / BASE_WIDTH;

  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected}
        minWidth={160}
        keepAspectRatio={true}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, background: nodeColor, border: 'none' }}
      />

      {/* 🛡️ 外层护盾：刚出生时有明确宽度和自适应高度，测量后 100% 占满 React Flow 分配的空间 */}
      <div style={{
        width: isInitialRender ? BASE_WIDTH : '100%',
        height: isInitialRender ? 'auto' : '100%',
        position: 'relative'
      }}>

        {/* 🔍 内层放大镜：刚出生时用 relative 撑开外壳，后续切换 absolute 开启神级等比缩放 */}
        <div
          className="comfyforge-node-container"
          style={{
            width: BASE_WIDTH,
            height: isInitialRender ? 'auto' : (height / scale),
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            // 就是这一行的魔法，解决了 0x0 隐形坍塌问题！
            position: isInitialRender ? 'relative' : 'absolute',
            top: 0,
            left: 0,

            background: bgColor,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: selected ? `1px solid ${nodeColor}` : `1px solid rgba(255,255,255,0.1)`,
            borderRadius: '8px',
            boxShadow: selected
              ? `0 0 0 1px ${nodeColor}, 0 0 20px ${glowColor}, inset 0 0 12px rgba(255,255,255,0.05)`
              : '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.1)',
            padding: 0,

            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* 顶部战术数据链 */}
          <div className="custom-drag-handle" style={{
            background: `linear-gradient(90deg, ${hexToRgba(nodeColor, 0.8)} 0%, ${hexToRgba(nodeColor, 0.2)} 100%)`,
            padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${nodeColor}`, cursor: 'grab'
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

          {/* 内容区域 */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', overflowX: 'hidden' }}>
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
              {children}
            </ConfigProvider>
          </div>
        </div>
      </div>
    </>
  );
});