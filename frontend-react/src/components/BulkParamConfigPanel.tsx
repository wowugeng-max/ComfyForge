import React, { useState, useEffect } from 'react';
import { Modal, Checkbox, Input, Table, message, Button, Space, Typography, Tag, Alert } from 'antd';
import { BulbOutlined, SwapRightOutlined, ApiOutlined, NodeIndexOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Suggestion } from '../utils/workflowSuggestions';

const { Text } = Typography;

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
    const names = data.filter(item => item.enabled).map(item => item.customName.trim());
    if (names.length !== new Set(names).size) {
      message.error('映射的参数别名不能重复');
      return;
    }
    for (const item of data) {
      if (item.enabled && !item.customName.trim()) {
        message.error('请填写所有已勾选字段的暴露别名');
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
      title: (
        <Checkbox checked={selectAll} onChange={(e) => handleToggleAll(e.target.checked)} />
      ),
      dataIndex: 'enabled',
      width: 50,
      align: 'center',
      render: (_, record) => (
        <Checkbox
          checked={record.enabled}
          onChange={(e) => handleToggleItem(record.key, e.target.checked)}
          style={{ transform: 'scale(1.1)' }}
        />
      ),
    },
    {
      title: '源节点 & 字段',
      key: 'source',
      width: 240,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag icon={<NodeIndexOutlined />} color="cyan" style={{ margin: 0, borderRadius: 4 }}>
              Node #{record.nodeId}
            </Tag>
            <Text style={{ fontFamily: 'monospace', fontSize: 12, color: record.enabled ? '#0f172a' : '#94a3b8' }}>
              {record.field}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '当前预设值',
      dataIndex: 'currentValue',
      width: 200,
      render: (val, record) => (
        <div style={{
          fontSize: 11, color: '#64748b', fontFamily: 'monospace',
          background: record.enabled ? 'rgba(255,255,255,0.8)' : '#f8fafc',
          padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 180
        }} title={JSON.stringify(val)}>
          {typeof val === 'string' ? `"${val}"` : JSON.stringify(val)}
        </div>
      ),
    },
    {
      title: '暴露映射别名',
      key: 'mapping',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: record.enabled ? 1 : 0.4, transition: 'opacity 0.3s' }}>
          <SwapRightOutlined style={{ color: '#94a3b8', fontSize: 18 }} />
          <Input
            prefix={<ApiOutlined style={{ color: '#722ed1' }} />}
            value={record.customName}
            onChange={(e) => handleCustomNameChange(record.key, e.target.value)}
            disabled={!record.enabled}
            placeholder="输入易读的别名..."
            style={{ width: 220, borderColor: record.enabled ? '#d3adf7' : '#d9d9d9' }}
          />
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BulbOutlined style={{ color: '#722ed1', fontSize: 18 }} />
          <span style={{ fontSize: 16 }}>智能参数映射提取 <Text type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>| 基于蓝图拓扑结构</Text></span>
        </div>
      }
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      width={800}
      styles={{
        body: { padding: '20px 24px', background: '#f8fafc' },
        header: { padding: '16px 24px', borderBottom: '1px solid #f0f0f0', margin: 0 },
        footer: { padding: '16px 24px', borderTop: '1px solid #f0f0f0', margin: 0 }
      }}
      okText="确认批量映射"
      cancelText="暂不暴露"
    >
      <Alert
        message={<Text strong style={{ color: '#531dab' }}>引擎已扫描工作流</Text>}
        description="系统已自动识别出常用的提示词、种子、尺寸等高频参数。勾选并确认别名后，它们将作为外部可用参数暴露给大脑节点调用。"
        type="info"
        showIcon
        icon={<BulbOutlined />}
        style={{ marginBottom: 16, background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 8 }}
      />

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
          <Text strong style={{ fontSize: 13, color: '#475569' }}>共嗅探到 {data.length} 个建议参数</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>已选中 {data.filter(d => d.enabled).length} 项</Text>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          pagination={false}
          size="middle"
          rowKey="key"
          scroll={{ y: 360 }}
          rowClassName={(record) => record.enabled ? 'magic-row-selected' : 'magic-row-disabled'}
        />
      </div>

      <style>{`
        .magic-row-selected > td {
          background-color: #f9f0ff !important;
          transition: background-color 0.3s;
        }
        .magic-row-disabled > td {
          background-color: #ffffff !important;
          transition: background-color 0.3s;
        }
        .ant-table-thead > tr > th {
          background: #fafafa !important;
          color: #475569 !important;
          font-weight: 600 !important;
        }
      `}</style>
    </Modal>
  );
}