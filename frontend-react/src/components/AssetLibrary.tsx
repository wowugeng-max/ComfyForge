import React, { useEffect } from 'react';
import { Input, Select, Spin, List, Tag } from 'antd';
import { useAssetLibraryStore } from '../stores/assetLibraryStore';
import { useDrag } from 'react-dnd';
import { DndItemTypes } from '../constants/dnd'; // 导入常量

const { Option } = Select;
const { Search } = Input;

const AssetLibrary: React.FC = () => {
  const { assets, loading, filterType, searchText, fetchAssets, setFilterType, setSearchText } = useAssetLibraryStore();

  useEffect(() => {
    fetchAssets();
  }, []);

  const filteredAssets = assets.filter(asset => {
    if (filterType && asset.type !== filterType) return false;
    if (searchText && !asset.name.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8 }}>
        <Select
          placeholder="资产类型"
          allowClear
          style={{ width: '100%', marginBottom: 8 }}
          onChange={setFilterType}
        >
          <Option value="image">图像</Option>
          <Option value="prompt">提示词</Option>
          <Option value="video">视频</Option>
        </Select>
        <Search
          placeholder="搜索资产"
          onSearch={setSearchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ marginBottom: 8 }}
        />
      </div>
      {loading ? (
        <Spin style={{ margin: 'auto' }} />
      ) : (
        <List
          dataSource={filteredAssets}
          renderItem={(asset) => <AssetItem asset={asset} />}
          style={{ overflow: 'auto', flex: 1 }}
        />
      )}
    </div>
  );
};

const AssetItem: React.FC<{ asset: Asset }> = ({ asset }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DndItemTypes.ASSET, // 使用常量
    item: { asset },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      style={{
        padding: 8,
        margin: 4,
        border: '1px solid #ddd',
        borderRadius: 4,
        background: isDragging ? '#e6f7ff' : '#fff',
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {asset.thumbnail && (
        <img src={asset.thumbnail} alt="" style={{ width: 40, height: 40, marginRight: 8, objectFit: 'cover' }} />
      )}
      <div style={{ flex: 1 }}>
        <div>{asset.name}</div>
        <Tag color="blue">{asset.type}</Tag>
      </div>
    </div>
  );
};

export default AssetLibrary;