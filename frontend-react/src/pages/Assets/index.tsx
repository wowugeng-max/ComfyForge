import React, { useState, useEffect } from 'react';
import { Space, Select, Button, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

interface Asset {
  id: number;
  type: string;
  name: string;
  description: string;
  tags: string[];
  created_at: string;
  // 可根据需要添加更多字段
}

export default function AssetList() {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取项目列表
  const fetchProjects = async () => {
    try {
      const res = await apiClient.get('/projects/');
      setProjects(res.data);
    } catch (error) {
      console.error('加载项目失败', error);
    }
  };

  // 获取资产列表
  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (typeFilter) params.type = typeFilter;
      if (projectId) params.project_id = projectId;
      const res = await apiClient.get('/assets/', { params });
      setAssets(res.data);
    } catch (error) {
      message.error('加载资产失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchAssets();
  }, []); // 注意：如果依赖 typeFilter 或 projectId 变化时自动刷新，可以加入依赖数组，但为避免频繁请求，这里仅初始化加载，刷新由按钮触发

  // 表格列定义
  const columns: ColumnsType<Asset> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => <Link to={`/assets/${record.id}`}>{text}</Link>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) => tags.join(', '),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Link to={`/assets/${record.id}`}>查看</Link>
          <Button
            type="link"
            danger
            onClick={async () => {
              try {
                await apiClient.delete(`/assets/${record.id}`);
                message.success('删除成功');
                fetchAssets(); // 刷新列表
              } catch {
                message.error('删除失败');
              }
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h1>资产管理</h1>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="资产类型"
          allowClear
          style={{ width: 120 }}
          onChange={(value) => setTypeFilter(value)}
          options={[
            { value: 'prompt', label: '提示词' },
            { value: 'image', label: '图像' },
            { value: 'character', label: '角色' },
            { value: 'workflow', label: '工作流' },
            { value: 'video', label: '视频' },
          ]}
        />
        <Select
          placeholder="所属项目"
          allowClear
          style={{ width: 150 }}
          onChange={(value) => setProjectId(value)}
          options={projects.map(p => ({ value: p.id, label: p.name }))}
        />
        <Button onClick={fetchAssets}>刷新</Button>
        <Link to="/assets/create">
          <Button type="primary">新建资产</Button>
        </Link>
        <Link to="/assets/workflow-config">
          <Button type="primary" ghost>新建工作流参数</Button>
        </Link>
      </Space>
      <Table
        columns={columns}
        dataSource={assets}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}