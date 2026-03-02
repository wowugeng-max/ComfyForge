import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Input, Table, message, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Suggestion } from '../utils/workflowSuggestions';

interface ConfigItem {
  key: string;
  nodeId: string;
  field: string;
  currentValue: any;
  suggestion?: Suggestion;
  customName: string;
  enabled: boolean;
}

export function BulkParamConfigPanel({
  visible,
  suggestionsMap,
  workflowJson,
  onSave,
  onCancel,
}: {
  visible: boolean;
  suggestionsMap: Record<string, Suggestion[]>;
  workflowJson: any;
  onSave: (params: Record<string, { node_id: string; field: string }>) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<ConfigItem[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    if (visible && suggestionsMap && workflowJson) {
      const items: ConfigItem[] = [];
      Object.entries(suggestionsMap).forEach(([nodeId, suggestions]) => {
        const nodeData = workflowJson[nodeId];
        suggestions.forEach((sug) => {
          const value = nodeData?.inputs?.[sug.field];
          items.push({
            key: `${nodeId}-${sug.field}`,
            nodeId,
            field: sug.field,
            currentValue: value,
            suggestion: sug,
            customName: sug.friendlyName,
            enabled: sug.autoCheck || false,
          });
        });
      });
      setData(items);
    }
  }, [visible, suggestionsMap, workflowJson]);

  useEffect(() => {
    // 更新全选状态
    if (data.length > 0) {
      setSelectAll(data.every(item => item.enabled));
    }
  }, [data]);

  const handleToggleAll = (checked: boolean) => {
    setData(prev => prev.map(item => ({ ...item, enabled: checked })));
  };

  const handleToggleItem = (key: string, checked: boolean) => {
    setData(prev => prev.map(item => (item.key === key ? { ...item, enabled: checked } : item)));
  };

  const handleCustomNameChange = (key: string, name: string) => {
    setData(prev => prev.map(item => (item.key === key ? { ...item, customName: name } : item)));
  };

  const handleOk = () => {
    // 检查自定义名称不能重复
    const names = data.filter(item => item.enabled).map(item => item.customName.trim());
    if (names.length !== new Set(names).size) {
      message.error('参数名称不能重复');
      return;
    }
    for (const item of data) {
      if (item.enabled && !item.customName.trim()) {
        message.error('请填写所有勾选字段的参数名称');
        return;
      }
    }
    const params: Record<string, { node_id: string; field: string }> = {};
    data.forEach(item => {
      if (item.enabled && item.customName.trim()) {
        params[item.customName.trim()] = {
          node_id: item.nodeId,
          field: `inputs/${item.field}`,
        };
      }
    });
    onSave(params);
  };

  const columns: ColumnsType<ConfigItem> = [
    {
      title: '选择',
      dataIndex: 'enabled',
      width: 60,
      render: (_, record) => (
        <Checkbox
          checked={record.enabled}
          onChange={(e) => handleToggleItem(record.key, e.target.checked)}
        />
      ),
    },
    {
      title: '节点ID',
      dataIndex: 'nodeId',
      width: 80,
    },
    {
      title: '字段',
      dataIndex: 'field',
      width: 120,
    },
    {
      title: '当前值',
      dataIndex: 'currentValue',
      ellipsis: true,
      render: (val) => JSON.stringify(val),
    },
    {
      title: '参数名称',
      dataIndex: 'customName',
      render: (text, record) => (
        <Input
          value={text}
          onChange={(e) => handleCustomNameChange(record.key, e.target.value)}
          disabled={!record.enabled}
          placeholder="参数名称"
        />
      ),
    },
  ];

  return (
    <Modal
      title="批量配置参数"
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      width={900}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" onClick={handleOk}>确认</Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Checkbox
            checked={selectAll}
            onChange={(e) => handleToggleAll(e.target.checked)}
          >
            全选
          </Checkbox>
          <span>共 {data.length} 个可配置字段</span>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        pagination={false}
        size="small"
        rowKey="key"
        scroll={{ y: 400 }}
      />
    </Modal>
  );
}