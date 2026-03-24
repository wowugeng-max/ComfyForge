// frontend-react/src/components/CameraControl.tsx
import React, { useState } from 'react';
import { Typography, Button, Input } from 'antd';
import { CloseOutlined, UpOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const CAMERA_PARAMS = [
  { key: 'camera', label: '相机', options: ['Arri Alexa 35', 'RED Komodo 6K', 'Sony Venice 2', 'Panavision DXL2', 'Blackmagic URSA', 'Canon EOS R5C'] },
  { key: 'lens', label: '镜头', options: ['Arri Signature Prime', 'Zeiss Supreme Prime', 'Leica Summilux-C', 'Cooke S7/i', 'Panavision Primo', 'Canon CN-E'] },
  { key: 'focal_length', label: '焦距', options: ['14mm', '24mm', '35mm', '50mm', '85mm', '135mm', '200mm'] },
  { key: 'aperture', label: '光圈', options: ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/16'] },
  { key: 'shot_angle', label: '机位', options: ['ELS (极远景)', 'LS (远景)', 'MLS (中远景)', 'MS (中景)', 'MCU (中近景)', 'CU (近景)', 'ECU (特写)', 'High-Angle (俯拍)', 'Low-Angle (仰拍)', 'Dutch Angle (斜角)'] },
  { key: 'lighting', label: '光线', options: ['Golden Hour', 'Blue Hour', 'Cinematic Lighting', 'Neon Lights', 'Moody Low-Key', 'High-Key Bright', 'Rembrandt Lighting', 'Backlit Silhouette'] },
  { key: 'film_style', label: '画风', options: ['Film Grain', 'Anamorphic Lens Flare', 'Shallow DOF', 'HDR', 'Teal and Orange', 'Desaturated', 'Vintage Film', 'Hyperrealistic'] },
];

export type CustomCameraOptions = Record<string, string[]>;

export const buildCameraPromptSuffix = (cp: Record<string, string>): string => {
  const parts: string[] = [];
  if (cp.focal_length) {
    const mm = parseInt(cp.focal_length);
    if (mm <= 24) parts.push('wide-angle perspective, expansive view');
    else if (mm <= 50) parts.push('natural perspective');
    else if (mm <= 100) parts.push('compressed perspective, subject isolation');
    else parts.push('telephoto compression, strong background blur');
  }
  if (cp.aperture) {
    const f = parseFloat(cp.aperture.replace('f/', ''));
    if (f <= 2) parts.push('extremely shallow depth of field, creamy bokeh');
    else if (f <= 4) parts.push('shallow depth of field, soft bokeh');
    else if (f <= 8) parts.push('moderate depth of field');
    else parts.push('deep focus, everything sharp');
  }
  if (cp.shot_angle) {
    const angle = cp.shot_angle.split(' ')[0];
    const angleMap: Record<string, string> = {
      'ELS': 'extreme long shot, vast landscape', 'LS': 'long shot, full body visible',
      'MLS': 'medium long shot', 'MS': 'medium shot, waist up',
      'MCU': 'medium close-up, chest up', 'CU': 'close-up portrait',
      'ECU': 'extreme close-up, fine detail', 'High-Angle': 'high angle looking down',
      'Low-Angle': 'low angle looking up, dramatic', 'Dutch': 'tilted dutch angle',
    };
    parts.push(angleMap[angle] || angle);
  }
  if (cp.lighting) parts.push(`${cp.lighting} lighting`);
  if (cp.film_style) parts.push(cp.film_style);
  if (cp.camera || cp.lens) parts.push('cinematic film quality, professional color grading');
  if (parts.length === 0) return '';
  return `, ${parts.join(', ')}`;
};

/** 单个参数的上下箭头滚动选择卡片 */
function ParamWheel({ label, options, value, onChange, customOptions, onRemoveCustom }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  customOptions?: string[]; onRemoveCustom?: (opt: string) => void;
}) {
  const allOptions = ['', ...options];
  const currentIndex = value ? allOptions.indexOf(value) : 0;
  const idx = currentIndex >= 0 ? currentIndex : 0;
  const isCustomValue = value && customOptions?.includes(value);

  const goUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(allOptions[idx > 0 ? idx - 1 : allOptions.length - 1]);
  };
  const goDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(allOptions[idx < allOptions.length - 1 ? idx + 1 : 0]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, position: 'relative' }}>
      <Button type="text" size="small" icon={<UpOutlined />} onClick={goUp} style={{ color: '#94a3b8', fontSize: 10, height: 20, width: 20, padding: 0 }} />
      <div style={{
        background: value ? '#eff6ff' : '#f8fafc',
        border: value ? '2px solid #3b82f6' : '1px solid #e2e8f0',
        borderRadius: 10, padding: '8px 6px', minHeight: 52,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.2s', width: '100%', position: 'relative',
      }}>
        <Text style={{ fontSize: 10, color: value ? '#1d4ed8' : '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{label}</Text>
        <Text style={{ fontSize: 12, color: value ? '#1e293b' : '#cbd5e1', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>
          {value || '-'}
        </Text>
        {isCustomValue && onRemoveCustom && (
          <div
            onClick={(e) => { e.stopPropagation(); onRemoveCustom(value); onChange(''); }}
            style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#fee2e2', color: '#ef4444', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >×</div>
        )}
      </div>
      <Button type="text" size="small" icon={<DownOutlined />} onClick={goDown} style={{ color: '#94a3b8', fontSize: 10, height: 20, width: 20, padding: 0 }} />
    </div>
  );
}

/** 触发按钮 */
export function CameraTrigger({ value, onClick }: { value: Record<string, string>; onClick: () => void }) {
  const hasParams = Object.values(value).some(v => v);
  return (
    <div
      className="nodrag"
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: hasParams ? '#eff6ff' : '#f1f5f9', color: hasParams ? '#1d4ed8' : '#64748b', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, border: '1px solid ' + (hasParams ? '#bfdbfe' : '#e2e8f0') }}
    >
      🎬 摄像机
    </div>
  );
}

/** 展开面板 */
export function CameraPanel({ value, onChange, onClose, customOptions, onCustomOptionsChange }: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onClose: () => void;
  customOptions?: CustomCameraOptions;
  onCustomOptionsChange?: (v: CustomCameraOptions) => void;
}) {
  const hasParams = Object.values(value).some(v => v);
  const suffix = buildCameraPromptSuffix(value);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [newOption, setNewOption] = useState('');
  const custom = customOptions || {};

  const handleAddOption = () => {
    if (!addingKey || !newOption.trim() || !onCustomOptionsChange) return;
    const existing = custom[addingKey] || [];
    onCustomOptionsChange({ ...custom, [addingKey]: [...existing, newOption.trim()] });
    setNewOption('');
    setAddingKey(null);
  };

  const handleRemoveOption = (key: string, opt: string) => {
    if (!onCustomOptionsChange) return;
    const existing = custom[key] || [];
    onCustomOptionsChange({ ...custom, [key]: existing.filter(o => o !== opt) });
  };

  return (
    <div className="nodrag nowheel" style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>摄像机控制</Text>
        <div style={{ display: 'flex', gap: 4 }}>
          {hasParams && (
            <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); onChange({}); }} style={{ color: '#ef4444', fontSize: 11 }}>
              重置
            </Button>
          )}
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ color: '#94a3b8' }} />
        </div>
      </div>

      {/* 网格布局的独立卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {CAMERA_PARAMS.map(param => {
          const mergedOptions = [...param.options, ...(custom[param.key] || [])];
          return (
            <ParamWheel
              key={param.key}
              label={param.label}
              options={mergedOptions}
              value={value[param.key] || ''}
              onChange={v => onChange({ ...value, [param.key]: v })}
              customOptions={custom[param.key]}
              onRemoveCustom={onCustomOptionsChange ? (opt) => {
                const existing = custom[param.key] || [];
                onCustomOptionsChange({ ...custom, [param.key]: existing.filter(o => o !== opt) });
              } : undefined}
            />
          );
        })}
      </div>

      {/* 自定义选项添加区 */}
      {onCustomOptionsChange && (
        <div style={{ marginTop: 8 }}>
          {addingKey ? (
            <div style={{ background: '#faf5ff', borderRadius: 8, border: '1px solid #ddd6fe', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                为「{CAMERA_PARAMS.find(p => p.key === addingKey)?.label}」添加选项
              </Text>
              <div style={{ display: 'flex', gap: 4 }}>
                <Input size="small" placeholder="输入新选项..." value={newOption} onChange={e => setNewOption(e.target.value)} onPressEnter={handleAddOption} style={{ flex: 1, fontSize: 12 }} />
                <Button size="small" type="primary" onClick={handleAddOption} disabled={!newOption.trim()}>添加</Button>
                <Button size="small" onClick={() => { setAddingKey(null); setNewOption(''); }}>取消</Button>
              </div>
              {/* 显示已有自定义选项 */}
              {(custom[addingKey] || []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(custom[addingKey] || []).map(opt => (
                    <span key={opt} style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 10, padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                      {opt}
                      <span onClick={() => handleRemoveOption(addingKey, opt)} style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {CAMERA_PARAMS.map(p => (
                <div key={p.key} onClick={() => setAddingKey(p.key)}
                  style={{ fontSize: 10, color: '#7c3aed', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, background: '#faf5ff', border: '1px solid #ede9fe', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PlusOutlined style={{ fontSize: 8 }} /> {p.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hasParams && (
        <div style={{ marginTop: 8, background: '#eff6ff', padding: '6px 10px', borderRadius: 6, border: '1px solid #bfdbfe', fontSize: 11, color: '#1d4ed8', fontFamily: 'monospace', lineHeight: 1.5 }}>
          {suffix}
        </div>
      )}
    </div>
  );
}

/** 一体化组件 */
export default function CameraControl({ value, onChange, open: controlledOpen, onOpenChange, customOptions, onCustomOptionsChange }: {
  value: Record<string, string>; onChange: (v: Record<string, string>) => void;
  open?: boolean; onOpenChange?: (open: boolean) => void;
  customOptions?: CustomCameraOptions; onCustomOptionsChange?: (v: CustomCameraOptions) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { onOpenChange ? onOpenChange(v) : setInternalOpen(v); };

  return (
    <>
      <CameraTrigger value={value} onClick={() => setOpen(!isOpen)} />
      {isOpen && <CameraPanel value={value} onChange={onChange} onClose={() => setOpen(false)} customOptions={customOptions} onCustomOptionsChange={onCustomOptionsChange} />}
    </>
  );
}
