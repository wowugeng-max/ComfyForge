// frontend-react/src/components/CameraMovement.tsx
import React, { useState } from 'react';
import { Typography, Button, Input } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface CameraMovementPreset {
  label: string;
  value: string;
  prompt: string;
  icon: string;
  isCustom?: boolean;
}

export const DEFAULT_MOVEMENTS: CameraMovementPreset[] = [
  // 基础镜头
  { label: '固定镜头', value: 'static', prompt: 'static shot, locked camera, no camera movement', icon: '📌' },
  { label: '跟随拍摄', value: 'tracking', prompt: 'tracking shot, camera follows the subject smoothly', icon: '🏃' },
  { label: '第一视角', value: 'first_person', prompt: 'first person POV shot, subjective camera angle', icon: '👁️' },
  { label: '手持拍摄', value: 'handheld', prompt: 'handheld camera, slight natural shake, documentary style', icon: '✋' },
  // 推拉
  { label: '镜头前推', value: 'dolly_in', prompt: 'dolly zoom in, camera pushing forward toward subject', icon: '🔍' },
  { label: '镜头后移', value: 'dolly_out', prompt: 'dolly zoom out, camera pulling back revealing scene', icon: '🔭' },
  { label: '变焦拉远', value: 'zoom_out', prompt: 'smooth zoom out, lens focal length increasing', icon: '🔎' },
  { label: '变焦推进', value: 'zoom_in', prompt: 'smooth zoom in, lens focal length decreasing, closing in on subject', icon: '🎯' },
  // 摇移
  { label: '镜头上摇', value: 'tilt_up', prompt: 'camera tilting upward, vertical pan up', icon: '⬆️' },
  { label: '镜头下摇', value: 'tilt_down', prompt: 'camera tilting downward, vertical pan down', icon: '⬇️' },
  { label: '镜头左摇', value: 'pan_left', prompt: 'camera panning left, horizontal pan left', icon: '⬅️' },
  { label: '镜头右摇', value: 'pan_right', prompt: 'camera panning right, horizontal pan right', icon: '➡️' },
  // 升降平移
  { label: '镜头上升', value: 'crane_up', prompt: 'crane shot moving upward, rising aerial view', icon: '🔺' },
  { label: '镜头下降', value: 'crane_down', prompt: 'crane shot moving downward, descending view', icon: '🔻' },
  { label: '镜头左移', value: 'dolly_left', prompt: 'dolly shot moving left, lateral tracking left', icon: '◀️' },
  { label: '镜头右移', value: 'dolly_right', prompt: 'dolly shot moving right, lateral tracking right', icon: '▶️' },
  // 旋转环绕
  { label: '盘旋抬升', value: 'orbit_up', prompt: 'orbiting camera rising upward, spiral ascending shot', icon: '🔄' },
  { label: '盘旋下降', value: 'orbit_down', prompt: 'orbiting camera descending, spiral downward shot', icon: '🌀' },
  { label: '环绕拍摄', value: 'orbit_360', prompt: 'camera orbiting around subject 360 degrees, circular tracking shot', icon: '🔃' },
  { label: '滚筒旋转', value: 'barrel_roll', prompt: 'barrel roll camera rotation, spinning along the lens axis', icon: '🎡' },
  // 特殊运镜
  { label: '柯克变焦', value: 'vertigo', prompt: 'dolly zoom vertigo effect, background warping, Hitchcock zoom', icon: '🌊' },
  { label: '无人机', value: 'drone', prompt: 'drone flyover shot, smooth aerial gliding forward', icon: '🛸' },
  { label: '高空航拍', value: 'aerial', prompt: 'aerial drone shot, birds eye view, sweeping overhead', icon: '🚁' },
  { label: '弧线滑轨', value: 'arc_slider', prompt: 'arc slider shot, camera moving along curved rail, cinematic arc', icon: '🎬' },
];

/** 触发按钮 */
export function CameraMovementTrigger({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="nodrag"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f1f5f9', color: '#64748b', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, border: '1px solid #e2e8f0' }}
    >
      🎬 运镜
    </div>
  );
}

/** 展开面板 — 点击预设直接插入 prompt 文本，不做选中状态 */
export function CameraMovementPanel({ onInsert, onClose, customPresets, onAddCustom, onRemoveCustom }: {
  onInsert: (text: string) => void;
  onClose: () => void;
  customPresets: CameraMovementPreset[];
  onAddCustom: (preset: CameraMovementPreset) => void;
  onRemoveCustom: (value: string) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const allPresets = [...DEFAULT_MOVEMENTS, ...customPresets];

  const handleAdd = () => {
    if (!newLabel.trim() || !newPrompt.trim()) return;
    onAddCustom({
      label: newLabel.trim(),
      value: `custom_${Date.now()}`,
      prompt: newPrompt.trim(),
      icon: '🎯',
      isCustom: true,
    });
    setNewLabel('');
    setNewPrompt('');
    setShowAddForm(false);
  };

  return (
    <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>🎬 运镜控制</Text>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setShowAddForm(v => !v)} style={{ color: '#7c3aed', fontSize: 11 }}>
            自定义
          </Button>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ color: '#94a3b8' }} />
        </div>
      </div>

      {/* 自定义添加表单 */}
      {showAddForm && (
        <div style={{ background: '#faf5ff', borderRadius: 8, border: '1px solid #ddd6fe', padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Input size="small" placeholder="运镜名称（如：环绕飞行）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <Input.TextArea size="small" rows={2} placeholder="英文 Prompt（如：orbiting aerial shot...）" value={newPrompt} onChange={e => setNewPrompt(e.target.value)} style={{ fontSize: 12, fontFamily: 'monospace' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <Button size="small" onClick={() => setShowAddForm(false)}>取消</Button>
            <Button size="small" type="primary" onClick={handleAdd} disabled={!newLabel.trim() || !newPrompt.trim()}>添加</Button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {allPresets.map(m => (
          <div key={m.value}
            onClick={() => onInsert(m.prompt)}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', cursor: 'pointer', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#7c3aed'; (e.currentTarget as HTMLDivElement).style.background = '#faf5ff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
          >
            {m.isCustom && (
              <div
                onClick={(e) => { e.stopPropagation(); onRemoveCustom(m.value); }}
                style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#fee2e2', color: '#ef4444', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >×</div>
            )}
            <span style={{ fontSize: 18 }}>{m.icon}</span>
            <Text style={{ fontSize: 10, fontWeight: 500, color: '#475569', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</Text>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
        点击即插入到提示词光标位置
      </div>
    </div>
  );
}

/** 一体化组件 */
export default function CameraMovement({ onInsert, open: controlledOpen, onOpenChange, customPresets, onAddCustom, onRemoveCustom }: {
  onInsert: (text: string) => void;
  open?: boolean; onOpenChange?: (open: boolean) => void;
  customPresets: CameraMovementPreset[];
  onAddCustom: (preset: CameraMovementPreset) => void;
  onRemoveCustom: (value: string) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { onOpenChange ? onOpenChange(v) : setInternalOpen(v); };

  return (
    <>
      <CameraMovementTrigger onClick={() => setOpen(!isOpen)} />
      {isOpen && <CameraMovementPanel onInsert={onInsert} onClose={() => setOpen(false)} customPresets={customPresets} onAddCustom={onAddCustom} onRemoveCustom={onRemoveCustom} />}
    </>
  );
}
