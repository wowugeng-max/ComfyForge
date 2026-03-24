// frontend-react/src/components/AspectRatioSelector.tsx
import React, { useState } from 'react';
import { Typography, Button, InputNumber } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const ASPECT_RATIOS = [
  { label: '自适应', value: '', icon: '◻', size: '' },
  { label: '1:1', value: '1:1', icon: '◻', size: '1024*1024' },
  { label: '9:16', value: '9:16', icon: '▯', size: '768*1344' },
  { label: '16:9', value: '16:9', icon: '▭', size: '1344*768' },
  { label: '3:4', value: '3:4', icon: '▯', size: '864*1152' },
  { label: '4:3', value: '4:3', icon: '▭', size: '1152*864' },
  { label: '3:2', value: '3:2', icon: '▭', size: '1216*832' },
  { label: '2:3', value: '2:3', icon: '▯', size: '832*1216' },
  { label: '4:5', value: '4:5', icon: '▯', size: '896*1120' },
  { label: '5:4', value: '5:4', icon: '▭', size: '1120*896' },
  { label: '21:9', value: '21:9', icon: '▭', size: '1536*640' },
];

export interface AspectRatioValue {
  aspectRatio: string;
  customWidth: number;
  customHeight: number;
}

export function getAspectRatioSize(value: AspectRatioValue): string {
  if (value.aspectRatio === 'custom') return `${value.customWidth}*${value.customHeight}`;
  if (value.aspectRatio) return ASPECT_RATIOS.find(r => r.value === value.aspectRatio)?.size || '';
  return '';
}

export function getAspectRatioLabel(value: AspectRatioValue): string {
  if (value.aspectRatio === 'custom') return `${value.customWidth}×${value.customHeight}`;
  if (value.aspectRatio) return ASPECT_RATIOS.find(r => r.value === value.aspectRatio)?.label || value.aspectRatio;
  return '自适应';
}

/** 触发按钮 */
export function AspectRatioTrigger({ value, onClick }: { value: AspectRatioValue; onClick: () => void }) {
  const label = getAspectRatioLabel(value);
  return (
    <div
      className="nodrag"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: value.aspectRatio ? '#eff6ff' : '#f1f5f9', color: value.aspectRatio ? '#1d4ed8' : '#64748b', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, border: '1px solid ' + (value.aspectRatio ? '#bfdbfe' : '#e2e8f0') }}
    >
      ▭ {label}
    </div>
  );
}

/** 展开面板 */
export function AspectRatioPanel({ value, onChange, onClose }: { value: AspectRatioValue; onChange: (v: AspectRatioValue) => void; onClose: () => void }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>画面比例</Text>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ color: '#94a3b8' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {ASPECT_RATIOS.map(r => {
          const isActive = value.aspectRatio === r.value;
          return (
            <div key={r.value || '_default'} onClick={() => onChange({ ...value, aspectRatio: r.value })}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 4px', cursor: 'pointer', borderRadius: 8, border: isActive ? '2px solid #0ea5e9' : '1px solid #e2e8f0', background: isActive ? '#eff6ff' : '#fff', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16, color: isActive ? '#0ea5e9' : '#94a3b8' }}>{r.icon}</span>
              <Text style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? '#0ea5e9' : '#475569' }}>{r.label}</Text>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div
          onClick={() => onChange({ ...value, aspectRatio: 'custom' })}
          style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 8, border: value.aspectRatio === 'custom' ? '2px solid #0ea5e9' : '1px solid #e2e8f0', background: value.aspectRatio === 'custom' ? '#eff6ff' : '#fff', fontSize: 11, fontWeight: value.aspectRatio === 'custom' ? 700 : 500, color: value.aspectRatio === 'custom' ? '#0ea5e9' : '#475569', whiteSpace: 'nowrap' }}
        >
          自定义
        </div>
        {value.aspectRatio === 'custom' && (
          <>
            <InputNumber size="small" min={64} max={4096} step={64} value={value.customWidth} onChange={v => v && onChange({ ...value, customWidth: v })} style={{ width: 80, fontSize: 11 }} />
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>×</Text>
            <InputNumber size="small" min={64} max={4096} step={64} value={value.customHeight} onChange={v => v && onChange({ ...value, customHeight: v })} style={{ width: 80, fontSize: 11 }} />
          </>
        )}
      </div>
    </div>
  );
}

/** 一体化组件（内部管理 open 状态，适用于不需要分离布局的场景） */
export default function AspectRatioSelector({ value, onChange, open: controlledOpen, onOpenChange }: {
  value: AspectRatioValue; onChange: (v: AspectRatioValue) => void;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { onOpenChange ? onOpenChange(v) : setInternalOpen(v); };

  return (
    <>
      <AspectRatioTrigger value={value} onClick={() => setOpen(!isOpen)} />
      {isOpen && <AspectRatioPanel value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}
