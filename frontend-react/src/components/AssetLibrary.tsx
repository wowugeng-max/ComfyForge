import React, { useEffect, useMemo, useState } from 'react';
import { Input, Select, Spin, List, Tag, Typography, Badge, Empty, Tooltip } from 'antd';
import { useAssetLibraryStore, type Asset } from '../stores/assetLibraryStore';
import { useDrag } from 'react-dnd';
import { DndItemTypes } from '../constants/dnd';
import { SearchOutlined, FilterOutlined, PictureOutlined, FileTextOutlined, VideoCameraOutlined } from '@ant-design/icons';

const { Option } = Select;
const { Search } = Input;
const { Text } = Typography;

const AssetLibrary: React.FC = () => {
  const { assets, loading, filterType, searchText, fetchAssets, setFilterType, setSearchText } = useAssetLibraryStore();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // 提取所有资产中的唯一标签
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    assets.forEach(asset => {
      if (asset.data?.tags && Array.isArray(asset.data.tags)) {
        asset.data.tags.forEach((t: string) => tags.add(t));
      }
    });
    return Array.from(tags);
  }, [assets]);

  // 组合过滤逻辑
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchType = !filterType || asset.type === filterType;
      const matchSearch = !searchText ||
        asset.name.toLowerCase().includes(searchText.toLowerCase()) ||
        asset.data?.content?.toLowerCase().includes(searchText.toLowerCase());
      const matchTag = !selectedTag || (asset.data?.tags && asset.data.tags.includes(selectedTag));

      return matchType && matchSearch && matchTag;
    });
  }, [assets, filterType, searchText, selectedTag]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '12px 12px 0 12px', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          资产库 <Badge count={filteredAssets.length} overflowCount={999} style={{ backgroundColor: '#52c41a', marginLeft: 8 }} />
        </Typography.Title>

        <Search
          placeholder="搜索名称或内容..."
          allowClear
          onSearch={setSearchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ marginBottom: 12 }}
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Select
            placeholder="类型"
            allowClear
            style={{ flex: 1 }}
            suffixIcon={<FilterOutlined />}
            onChange={setFilterType}
            value={filterType}
          >
            <Option value="image"><PictureOutlined /> 图像</Option>
            <Option value="prompt"><FileTextOutlined /> 提示词</Option>
            <Option value="video"><VideoCameraOutlined /> 视频</Option>
          </Select>

          <Select
            placeholder="标签"
            allowClear
            style={{ flex: 1 }}
            onChange={setSelectedTag}
          >
            {allTags.map(tag => (
              <Option key={tag} value={tag}>{tag}</Option>
            ))}
          </Select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin tip="加载资产中..." /></div>
        ) : filteredAssets.length > 0 ? (
          <List
            dataSource={filteredAssets}
            renderItem={(asset) => <AssetItem key={asset.id} asset={asset} />}
            split={false}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到相关资产" />
        )}
      </div>
    </div>
  );
};

const AssetItem: React.FC<{ asset: Asset }> = ({ asset }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DndItemTypes.ASSET,
    item: { asset },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const getIcon = () => {
    switch (asset.type) {
      case 'image': return <PictureOutlined style={{ color: '#1890ff' }} />;
      case 'video': return <VideoCameraOutlined style={{ color: '#eb2f96' }} />;
      case 'prompt': return <FileTextOutlined style={{ color: '#52c41a' }} />;
      default: return null;
    }
  };

  // 简单的预览处理
  const preview = asset.thumbnail || (asset.type === 'image' ? asset.data?.file_path : null);

  return (
    <div
      ref={drag}
      style={{
        padding: '8px 12px',
        marginBottom: 8,
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        background: isDragging ? '#e6f7ff' : '#fff',
        cursor: 'grab',
        transition: 'all 0.2s',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
      }}
      className="asset-item-hover"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {preview ? (
          <img
            src={preview.startsWith('http') ? preview : `http://localhost:8000/${preview}`}
            alt=""
            style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', border: '1px solid #eee' }}
          />
        ) : (
          <div style={{ width: 32, height: 32, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}>
            {getIcon()}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Tooltip title={asset.name} placement="right">
            <Text strong style={{ fontSize: 13, display: 'block' }} ellipsis>
              {asset.name}
            </Text>
          </Tooltip>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {asset.type.toUpperCase()} · ID: {asset.id}
          </Text>
        </div>
      </div>

      {asset.data?.tags && asset.data.tags.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {asset.data.tags.slice(0, 2).map((tag: string) => (
            <Tag key={tag} style={{ fontSize: 10, marginInlineEnd: 4, paddingInline: 4 }}>{tag}</Tag>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssetLibrary;