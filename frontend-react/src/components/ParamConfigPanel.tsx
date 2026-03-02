import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Input, Form, message } from 'antd';
import type {Suggestion} from '../utils/workflowSuggestions';

interface FieldOption {
  field: string;
  value: any;
  customName: string;
  enabled: boolean;
}

export function ParamConfigPanel({
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
          // 查找是否有推荐配置
          const suggestion = nodeSuggestions.find(s => s.field === field);
          // 如果已有配置名，则优先使用；否则如果有推荐且自动勾选，则使用推荐名；否则使用字段名
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
    // 检查自定义名称不能重复
    const names = fields.filter(f => f.enabled).map(f => f.customName.trim());
    if (names.length !== new Set(names).size) {
      message.error('参数名称不能重复');
      return;
    }
    for (const f of fields) {
      if (f.enabled && !f.customName.trim()) {
        message.error('请填写所有勾选字段的参数名称');
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
                  value={f.customName}
                  onChange={(e) => updateCustomName(idx, e.target.value)}
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