import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Input, Form } from 'antd';

interface FieldOption {
  field: string;
  value: any;
  paramName: string;
  enabled: boolean;
}

export function ParamConfigPanel({
  visible,
  nodeData,
  onSave,
  onCancel,
}: {
  visible: boolean;
  nodeData?: { id: string; inputs: Record<string, any> };
  onSave: (params: Record<string, { node_id: string; field: string }>) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<FieldOption[]>([]);

  useEffect(() => {
    if (nodeData) {
      // 提取可配置字段（非数组）
      const configurable = Object.entries(nodeData.inputs || {})
        .filter(([_, value]) => !Array.isArray(value))
        .map(([field, value]) => ({
          field,
          value,
          paramName: '',
          enabled: false,
        }));
      setFields(configurable);
    }
  }, [nodeData]);

  const handleOk = () => {
    const params: Record<string, { node_id: string; field: string }> = {};
    fields.forEach((f) => {
      if (f.enabled && f.paramName.trim()) {
        params[f.paramName.trim()] = {
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
    if (enabled && !newFields[index].paramName) {
      newFields[index].paramName = newFields[index].field; // 默认使用字段名
    }
    setFields(newFields);
  };

  const updateParamName = (index: number, name: string) => {
    const newFields = [...fields];
    newFields[index].paramName = name;
    setFields(newFields);
  };

  return (
    <Modal
      title={`配置参数 - 节点 ${nodeData?.id}`}
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      width={600}
    >
      {fields.length === 0 ? (
        <p>该节点没有可配置的输入字段。</p>
      ) : (
        <Form layout="vertical">
          {fields.map((f, idx) => (
            <div key={f.field} style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
              <Checkbox
                checked={f.enabled}
                onChange={(e) => toggleField(idx, e.target.checked)}
                style={{ marginRight: 12 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{f.field}</div>
                <div style={{ fontSize: 12, color: '#999' }}>当前值: {JSON.stringify(f.value)}</div>
              </div>
              {f.enabled && (
                <Input
                  placeholder="参数名称"
                  value={f.paramName}
                  onChange={(e) => updateParamName(idx, e.target.value)}
                  style={{ width: 200, marginLeft: 12 }}
                />
              )}
            </div>
          ))}
        </Form>
      )}
    </Modal>
  );
}