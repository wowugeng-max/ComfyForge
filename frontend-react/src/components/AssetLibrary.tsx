import React, { useEffect, useMemo, useState } from 'react';
// 🌟 核心修复 1：从 antd 导入中彻底删除了废弃的 List
import {Input, Select, Spin, Tag, Typography, Badge, Empty, Tooltip, Segmented} from 'antd';
import { useAssetLibraryStore, type Asset } from '../stores/assetLibraryStore';
import { useDrag } from 'react-dnd';
import { DndItemTypes } from '../constants/dnd';
import {
  SearchOutlined,
  FilterOutlined,
  PictureOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  ApiOutlined
} from '@ant-design/icons';


const { Option } = Select;
const { Search } = Input;
const { Text } = Typography;

// 🌟 增加 Props 接口
interface AssetLibraryProps {
  projectId?: number;
}

const AssetLibrary: React.FC<AssetLibraryProps> = ({ projectId }) => {
  const { assets, loading, filterType, searchText, scope, setScope,fetchAssets, setFilterType, setSearchText } = useAssetLibraryStore();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    // 🌟 每次加载或切换项目时，根据 projectId 获取专属资产
    fetchAssets(projectId);
  }, [fetchAssets, projectId, scope]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    assets.forEach(asset => {
      if (asset.tags && Array.isArray(asset.tags)) {
        asset.tags.forEach((t: string) => tags.add(t));
      }
    });
    return Array.from(tags);
  }, [assets]);

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchType = !filterType || asset.type === filterType;

      const safeName = asset.name || '';
      const contentText = typeof asset.data?.content === 'string' ? asset.data.content : '';

      const matchSearch = !searchText ||
        safeName.toLowerCase().includes(searchText.toLowerCase()) ||
        contentText.toLowerCase().includes(searchText.toLowerCase());

      const matchTag = !selectedTag || (asset.tags && asset.tags.includes(selectedTag));

      return matchType && matchSearch && matchTag;
    });
  }, [assets, filterType, searchText, selectedTag]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '12px 12px 0 12px', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          资产库 <Badge count={filteredAssets.length} overflowCount={999} style={{ backgroundColor: '#52c41a', marginLeft: 8 }} />
        </Typography.Title>

        {/* 🌟 3. 核心：双轨作用域切换器 */}
        <Segmented
          block
          options={[
            { label: '📦 项目专属', value: 'project' },
            { label: '🌍 全局公共', value: 'global' }
          ]}
          value={scope}
          onChange={(val) => setScope(val as 'project' | 'global')}
          style={{ marginBottom: 12 }}
        />

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
            <Option value="workflow"><ApiOutlined /> 工作流</Option>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            {/* 🌟 核心修复 2：用 description 替换了废弃的 tip */}
            <Spin description="加载资产中..." />
          </div>
        ) : filteredAssets.length > 0 ? (
          /* 🌟 核心修复 3：彻底抛弃 List，用原生 div 遍历渲染，绝对不会被拦截 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredAssets.map(asset => (
              <AssetItem key={asset.id} asset={asset} />
            ))}
          </div>
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
      case 'workflow': return <ApiOutlined style={{ color: '#722ed1' }} />;
      default: return <FileTextOutlined />;
    }
  };

  const preview = asset.thumbnail || (asset.type === 'image' ? asset.data?.file_path : null);

  return (
    <div
      ref={drag}
      style={{
        padding: '8px 12px',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        background: isDragging ? '#e6f7ff' : '#fff',
        cursor: 'grab',
        transition: 'all 0.2s',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.02)',
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
              {asset.name || '未命名资产'}
            </Text>
          </Tooltip>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {asset.type.toUpperCase()} · ID: {asset.id}
          </Text>
        </div>
      </div>

      {asset.tags && asset.tags.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {asset.tags.slice(0, 3).map((tag: string) => (
            <Tag key={tag} style={{ fontSize: 10, marginInlineEnd: 4, paddingInline: 4, border: 'none', background: '#f5f5f5' }}>{tag}</Tag>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssetLibrary;