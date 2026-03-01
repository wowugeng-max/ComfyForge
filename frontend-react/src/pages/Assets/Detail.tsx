import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, Spin, message } from 'antd';
import apiClient from '../../api/client';

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAsset = async () => {
      try {
        const res = await apiClient.get(`/assets/${id}`);
        setAsset(res.data);
      } catch (error) {
        message.error('加载失败');
      } finally {
        setLoading(false);
      }
    };
    fetchAsset();
  }, [id]);

  if (loading) return <Spin />;

  if (!asset) return <div>资产不存在</div>;

  return (
    <Card
      title={`资产详情 - ${asset.name}`}
      extra={<Button onClick={() => navigate(`/assets/${id}/edit`)}>编辑</Button>}
    >
      <Descriptions bordered column={1}>
        <Descriptions.Item label="ID">{asset.id}</Descriptions.Item>
        <Descriptions.Item label="名称">{asset.name}</Descriptions.Item>
        <Descriptions.Item label="类型">{asset.type}</Descriptions.Item>
        <Descriptions.Item label="描述">{asset.description}</Descriptions.Item>
        <Descriptions.Item label="标签">{asset.tags?.join(', ')}</Descriptions.Item>
        <Descriptions.Item label="数据">
          <pre>{JSON.stringify(asset.data, null, 2)}</pre>
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">{new Date(asset.created_at).toLocaleString()}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}