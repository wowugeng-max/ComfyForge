import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Input, Form, message, Typography, Tag, Empty, Divider } from 'antd';
import { ApiOutlined, SettingOutlined, CodeOutlined, SwapRightOutlined } from '@ant-design/icons';
import type { Suggestion } from '../utils/workflowSuggestions';

const { Text } = Typography;

interface FieldOption {
  field: string;
  value: any;
  customName: string;
  enabled: boolean;
}

export const ParamConfigPanel = React.memo(function ParamConfigPanel({
  visible,
  nodeData,
  existingParams = {},
  nodeSuggestions = [],
  onSave,
  onCancel,
}: {
  visible: boolean;
  nodeData?: { id: string; inputs: Record<string, any> };
  existingParams?: Record<string, string>;
  nodeSuggestions?: Suggestion[];
  onSave: (params: Record<string, { node_id: string; field: string }>) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<FieldOption[]>([]);

  useEffect(() => {
    if (nodeData) {
      const configurable = Object.entries(nodeData.inputs || {})
        .filter(([_, value]) => !Array.isArray(value))
        .map(([field, value]) => {
          const existingName = existingParams[field];
          const suggestion = nodeSuggestions.find(s => s.field === field);
          const customName = existingName || (suggestion?.friendlyName) || field;
          const shouldEnable = existingName !== undefined || (suggestion?.autoCheck && !existingName);
          return {
            field,
            value,
            customName,
            enabled: shouldEnable,
          };
        });
      setFields(configurable);
    }
  }, [nodeData, existingParams, nodeSuggestions]);

  const handleOk = () => {
    const names = fields.filter(f => f.enabled).map(f => f.customName.trim());
    if (names.length !== new Set(names).size) {
      message.error('映射的参数别名不能重复');
      return;
    }
    for (const f of fields) {
      if (f.enabled && !f.customName.trim()) {
        message.error('请填写所有已勾选字段的暴露别名');
        return;
      }
    }
    const params: Record<string, { node_id: string; field: string }> = {};
    fields.forEach((f) => {
      if (f.enabled && f.customName.trim()) {
        params[f.customName.trim()] = {
          node_id: nodeData!.id,
          field: `inputs/${f.field}`,
        };
      }
    });
    onSave(params);
  };

  const toggleField = (index: number, enabled: boolean) => {
    const newFields = [...fields];
    newFields[index].enabled = enabled;
    if (enabled && !newFields[index].customName) {
      newFields[index].customName = newFields[index].field;
    }
    setFields(newFields);
  };

  const updateCustomName = (index: number, name: string) => {
    const newFields = [...fields];
    newFields[index].customName = name;
    setFields(newFields);
  };

  // 渲染单个参数配置卡片
  const renderFieldCard = (f: FieldOption, idx: number) => {
    const isEnabled = f.enabled;

    return (
      <div
        key={f.field}
        style={{
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          background: isEnabled ? '#f0f7ff' : '#ffffff',
          border: isEnabled ? '1px solid #bae0ff' : '1px solid #f0f0f0',
          borderRadius: 8,
          padding: '12px 16px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isEnabled ? '0 4px 12px rgba(24, 144, 255, 0.08)' : 'none'
        }}
      >
        <Checkbox
          checked={isEnabled}
          onChange={(e) => toggleField(idx, e.target.checked)}
          style={{ marginRight: 16, transform: 'scale(1.1)' }}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={isEnabled ? 'blue' : 'default'} style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, border: isEnabled ? 'none' : '' }}>
              {f.field}
            </Tag>
          </div>

          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', background: isEnabled ? 'rgba(255,255,255,0.6)' : '#f8fafc', padding: '4px 8px', borderRadius: 4, display: 'inline-block', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: '#94a3b8' }}>Default: </span>
            {typeof f.value === 'string' ? `"${f.value}"` : JSON.stringify(f.value)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 16, opacity: isEnabled ? 1 : 0.3, transition: 'opacity 0.3s', pointerEvents: isEnabled ? 'auto' : 'none' }}>
          <SwapRightOutlined style={{ color: '#94a3b8', fontSize: 20 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>映射别名 (全局可用)</Text>
            <Input
              prefix={<ApiOutlined style={{ color: '#1890ff' }} />}
              placeholder="输入易读的别名..."
              value={f.customName}
              onChange={(e) => updateCustomName(idx, e.target.value)}
              style={{ width: 180, borderColor: isEnabled ? '#91caff' : '#d9d9d9' }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingOutlined style={{ color: '#1890ff' }} />
          <span>参数映射面板 <Text type="secondary" style={{ fontSize: 14, fontWeight: 'normal' }}>| 节点 #{nodeData?.id}</Text></span>
        </div>
      }
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      width={680}
      styles={{
        body: { maxHeight: '60vh', overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' },
        header: { padding: '16px 24px', borderBottom: '1px solid #f0f0f0', margin: 0 },
        footer: { padding: '16px 24px', borderTop: '1px solid #f0f0f0', margin: 0 }
      }}
      okText="确认映射"
      cancelText="取消"
    >
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff', borderRadius: 8, border: '1px dashed #d9d9d9' }}>
        <Text style={{ fontSize: 13, color: '#475569' }}>
          <CodeOutlined style={{ marginRight: 6, color: '#1890ff' }} />
          勾选左侧需要动态覆盖的底层字段，并在右侧为其指定一个<strong>易读的别名</strong>（如 "正向提示词"）。这些别名将在执行工作流时暴露给用户。
        </Text>
      </div>

      {fields.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: '#94a3b8' }}>该节点没有可暴露的底层静态参数</span>}
          style={{ background: '#fff', padding: '40px 0', borderRadius: 8, border: '1px solid #f0f0f0' }}
        />
      ) : (
        <Form layout="vertical">
          {fields.map((f, idx) => renderFieldCard(f, idx))}
        </Form>
      )}
    </Modal>
  );
});