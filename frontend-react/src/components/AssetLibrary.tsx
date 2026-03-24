import React, { useEffect, useMemo, useState } from 'react';
import {Input, Select, Spin, Tag, Typography, Badge, Empty, Tooltip, Segmented, Button, Drawer, Form, Divider, message, Upload, Row, Col, Popconfirm} from 'antd';
import { useAssetLibraryStore, type Asset } from '../stores/assetLibraryStore';
import { useDrag } from 'react-dnd';
import { DndItemTypes } from '../constants/dnd';
import apiClient from '../api/client';
import { useNavigate, useParams } from 'react-router-dom';
import TagsInput from './TagsInput';
import {
  SearchOutlined,
  FilterOutlined,
  PictureOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  ApiOutlined,
  SendOutlined,
  EditOutlined,
  SaveOutlined,
  InboxOutlined,
  DeleteOutlined,
  PlusOutlined
} from '@ant-design/icons';


const { Option } = Select;
const { Search } = Input;
const { Text } = Typography;

// 🌟 增加 Props 接口
interface AssetLibraryProps {
  projectId?: number;
  onAddToCanvas?: (asset: Asset) => void;
}

const AssetLibrary: React.FC<AssetLibraryProps> = ({ projectId, onAddToCanvas }) => {
  const navigate = useNavigate();
  const canvasReturnUrl = projectId ? `/project/${projectId}` : '/';
  const { assets, loading, filterType, searchText, scope, setScope,fetchAssets, setFilterType, setSearchText } = useAssetLibraryStore();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [drawerForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [uploadedImageInfo, setUploadedImageInfo] = useState<any>(null);
  const [uploadedVideoInfo, setUploadedVideoInfo] = useState<any>(null);
  const { updateAsset, deleteAsset, createAsset } = useAssetLibraryStore();

  // 新建 Drawer 状态
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createType, setCreateType] = useState<string>('prompt');
  const [creatingSaving, setCreatingSaving] = useState(false);
  const [createUploadedImage, setCreateUploadedImage] = useState<any>(null);
  const [createUploadedVideo, setCreateUploadedVideo] = useState<any>(null);

  // 打开编辑 Drawer 时，预填表单
  useEffect(() => {
    if (editingAsset) {
      setUploadedImageInfo(null);
      setUploadedVideoInfo(null);
      const vals: any = {
        name: editingAsset.name,
        description: editingAsset.description || '',
        tags: editingAsset.tags?.join(', ') || '',
        ...editingAsset.data,
      };
      if (editingAsset.type === 'workflow' && editingAsset.data?.workflow_json) {
        vals.workflow_json = JSON.stringify(editingAsset.data.workflow_json, null, 2);
        vals.parameters = JSON.stringify(editingAsset.data.parameters, null, 2);
      }
      drawerForm.setFieldsValue(vals);
    }
  }, [editingAsset, drawerForm]);

  const handleDrawerSave = async () => {
    try {
      const values = await drawerForm.validateFields();
      setSaving(true);

      let data: any = {};
      const type = editingAsset!.type;
      if (type === 'prompt') {
        data = { content: values.content, negative_prompt: values.negative || '' };
      } else if (type === 'image') {
        const imgInfo = uploadedImageInfo || editingAsset!.data;
        data = { file_path: imgInfo.file_path, width: imgInfo.width, height: imgInfo.height, format: imgInfo.format };
      } else if (type === 'video') {
        const vidInfo = uploadedVideoInfo || editingAsset!.data;
        data = { file_path: vidInfo.file_path, width: vidInfo.width, height: vidInfo.height, duration: vidInfo.duration, fps: vidInfo.fps, format: vidInfo.format };
      } else if (type === 'workflow') {
        data = {
          workflow_json: values.workflow_json ? JSON.parse(values.workflow_json) : {},
          parameters: values.parameters ? JSON.parse(values.parameters) : {},
        };
      }

      await updateAsset(editingAsset!.id, {
        name: values.name,
        description: values.description || '',
        tags: values.tags ? values.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean) : [],
        data,
      });
      message.success('资产更新成功');
      setEditingAsset(null);
    } catch (error) {
      message.error('保存失败，请检查填写内容');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSave = async () => {
    try {
      const values = await createForm.validateFields();
      setCreatingSaving(true);

      let data: any = {};
      if (createType === 'prompt') {
        data = { content: values.content, negative_prompt: values.negative || '' };
      } else if (createType === 'image') {
        if (!createUploadedImage) { message.warning('请先上传图片'); return; }
        data = { file_path: createUploadedImage.file_path, width: createUploadedImage.width, height: createUploadedImage.height, format: createUploadedImage.format };
      } else if (createType === 'video') {
        if (!createUploadedVideo) { message.warning('请先上传视频'); return; }
        data = { file_path: createUploadedVideo.file_path, width: createUploadedVideo.width, height: createUploadedVideo.height, duration: createUploadedVideo.duration, fps: createUploadedVideo.fps, format: createUploadedVideo.format };
      } else if (createType === 'workflow') {
        data = {
          workflow_json: values.workflow_json ? JSON.parse(values.workflow_json) : {},
          parameters: values.parameters ? JSON.parse(values.parameters) : {},
        };
      }

      await createAsset({
        type: createType,
        name: values.name,
        description: values.description || '',
        tags: values.tags ? values.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean) : [],
        data,
        project_id: scope === 'project' ? (projectId || null) : null,
      });
      message.success('资产创建成功');
      setCreateOpen(false);
    } catch (error) {
      message.error('创建失败，请检查填写内容');
    } finally {
      setCreatingSaving(false);
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            资产库 <Badge count={filteredAssets.length} overflowCount={999} style={{ backgroundColor: '#52c41a', marginLeft: 8 }} />
          </Typography.Title>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => {
            setCreateType('prompt');
            createForm.resetFields();
            setCreateUploadedImage(null);
            setCreateUploadedVideo(null);
            setCreateOpen(true);
          }}>新建</Button>
        </div>

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
              <AssetItem key={asset.id} asset={asset} onAddToCanvas={onAddToCanvas} onEdit={setEditingAsset} onDelete={async (a) => { await deleteAsset(a.id); message.success('资产已删除'); }} />
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到相关资产" />
        )}
      </div>

      {/* 编辑 Drawer */}
      <Drawer
        title={editingAsset ? `编辑资产 · ${editingAsset.type.toUpperCase()}` : '编辑资产'}
        width={480}
        open={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        extra={
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleDrawerSave}>
            保存
          </Button>
        }
      >
        {editingAsset && (
          <Form form={drawerForm} layout="vertical">
            <Form.Item name="name" label="资产名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="tags" label="标签">
              <TagsInput />
            </Form.Item>

            {editingAsset.project_id && (
              <Form.Item label="归属项目">
                <Input value={`项目 ID: ${editingAsset.project_id}`} disabled />
              </Form.Item>
            )}

            <Divider dashed style={{ fontSize: 12, color: '#94a3b8' }}>模态数据</Divider>

            {editingAsset.type === 'prompt' && (
              <>
                <Form.Item name="content" label="提示词内容" rules={[{ required: true }]}>
                  <Input.TextArea rows={6} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
                <Form.Item name="negative" label="负面提示词">
                  <Input.TextArea rows={3} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </>
            )}

            {editingAsset.type === 'image' && (
              <>
                <Form.Item name="file_path" label="图片文件" rules={[{ required: true }]}>
                  <Upload.Dragger
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      const fd = new FormData();
                      fd.append('file', file as File);
                      try {
                        const res = await apiClient.post('/assets/upload/image', fd, {
                          headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        const info = res.data;
                        setUploadedImageInfo(info);
                        drawerForm.setFieldsValue({
                          file_path: info.file_path, width: info.width, height: info.height, format: info.format,
                        });
                        message.success('图片上传成功');
                        onSuccess?.(info);
                      } catch {
                        message.error('图片上传失败');
                        onError?.(new Error('upload failed'));
                      }
                    }}
                  >
                    {uploadedImageInfo ? (
                      <div style={{ padding: 8 }}>
                        <img src={`/api/assets/media/${uploadedImageInfo.file_path}`} alt="preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }} />
                        <p style={{ marginTop: 8, color: '#52c41a', fontSize: 12 }}>
                          {uploadedImageInfo.width} x {uploadedImageInfo.height} · {uploadedImageInfo.format?.toUpperCase()}
                        </p>
                      </div>
                    ) : editingAsset.data?.file_path ? (
                      <div style={{ padding: 8 }}>
                        <img
                          src={editingAsset.data.file_path.startsWith('http') || editingAsset.data.file_path.startsWith('data:') ? editingAsset.data.file_path : `/api/assets/media/${editingAsset.data.file_path}`}
                          alt="current" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }}
                        />
                        <p style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>点击或拖拽新图片替换</p>
                      </div>
                    ) : (
                      <>
                        <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} /></p>
                        <p style={{ fontSize: 13 }}>点击或拖拽图片上传</p>
                      </>
                    )}
                  </Upload.Dragger>
                </Form.Item>
                <Row gutter={12}>
                  <Col span={8}><Form.Item name="width" label="宽度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
                  <Col span={8}><Form.Item name="height" label="高度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
                  <Col span={8}><Form.Item name="format" label="格式"><Input readOnly /></Form.Item></Col>
                </Row>
                {editingAsset.data?.source_model && (
                  <div style={{ background: '#f0f5ff', padding: 12, borderRadius: 8, border: '1px solid #adc6ff', marginTop: 4 }}>
                    <Text strong style={{ color: '#1d39c4', fontSize: 12, display: 'block', marginBottom: 8 }}>🧬 AI 生成溯源</Text>
                    <Row gutter={[8, 6]}>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>厂商</Text><div style={{ fontSize: 12, fontWeight: 600 }}>{editingAsset.data.source_provider || '-'}</div></Col>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>模型</Text><div style={{ fontSize: 12, fontWeight: 600 }}>{editingAsset.data.source_model}</div></Col>
                      <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>模式</Text><div style={{ fontSize: 12, fontWeight: 600 }}>{editingAsset.data.source_mode || '-'}</div></Col>
                    </Row>
                    {editingAsset.data.source_aspect_ratio && (
                      <Row gutter={[8, 6]} style={{ marginTop: 6 }}>
                        <Col span={8}><Text type="secondary" style={{ fontSize: 10 }}>比例</Text><div style={{ fontSize: 12, fontWeight: 600 }}>{editingAsset.data.source_aspect_ratio}</div></Col>
                        <Col span={16}><Text type="secondary" style={{ fontSize: 10 }}>分辨率</Text><div style={{ fontSize: 12, fontWeight: 600 }}>{editingAsset.data.source_size || '-'}</div></Col>
                      </Row>
                    )}
                    {editingAsset.data.source_prompt && (
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 10 }}>提示词</Text>
                        <div style={{ background: '#fff', padding: 6, borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 80, overflow: 'auto', marginTop: 2 }}>{editingAsset.data.source_prompt}</div>
                      </div>
                    )}
                    {editingAsset.data.source_camera_params && Object.keys(editingAsset.data.source_camera_params).length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 10 }}>摄像机</Text>
                        <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {Object.entries(editingAsset.data.source_camera_params).map(([k, v]) => (
                            <Tag key={k} color="blue" style={{ fontSize: 10, margin: 0 }}>{k}: {String(v)}</Tag>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {editingAsset.type === 'video' && (
              <>
                <Form.Item name="file_path" label="视频文件" rules={[{ required: true }]}>
                  <Upload.Dragger
                    accept="video/mp4,video/webm,video/quicktime"
                    showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      const fd = new FormData();
                      fd.append('file', file as File);
                      try {
                        const res = await apiClient.post('/assets/upload/video', fd, {
                          headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        const info = res.data;
                        setUploadedVideoInfo(info);
                        drawerForm.setFieldsValue({
                          file_path: info.file_path, width: info.width, height: info.height,
                          duration: info.duration, fps: info.fps, format: info.format,
                        });
                        message.success('视频上传成功');
                        onSuccess?.(info);
                      } catch {
                        message.error('视频上传失败');
                        onError?.(new Error('upload failed'));
                      }
                    }}
                  >
                    {uploadedVideoInfo ? (
                      <div style={{ padding: 8 }}>
                        <VideoCameraOutlined style={{ fontSize: 32, color: '#eb2f96' }} />
                        <p style={{ marginTop: 8, color: '#52c41a', fontSize: 12 }}>
                          {uploadedVideoInfo.file_path?.split('/').pop()} · {uploadedVideoInfo.format?.toUpperCase()}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 32, color: '#eb2f96' }} /></p>
                        <p style={{ fontSize: 13 }}>点击或拖拽视频上传</p>
                      </>
                    )}
                  </Upload.Dragger>
                </Form.Item>
                <Row gutter={12}>
                  <Col span={6}><Form.Item name="width" label="宽度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
                  <Col span={6}><Form.Item name="height" label="高度"><Input type="number" addonAfter="px" readOnly /></Form.Item></Col>
                  <Col span={6}><Form.Item name="duration" label="时长"><Input type="number" addonAfter="s" readOnly /></Form.Item></Col>
                  <Col span={6}><Form.Item name="fps" label="帧率"><Input type="number" addonAfter="fps" readOnly /></Form.Item></Col>
                </Row>
                <Form.Item name="format" label="格式"><Input readOnly /></Form.Item>
              </>
            )}

            {editingAsset.type === 'workflow' && (
              <>
                <Button type="link" style={{ padding: 0, marginBottom: 12 }} onClick={() => navigate(`/assets/workflow-config/edit/${editingAsset.id}?returnUrl=${encodeURIComponent(canvasReturnUrl)}`)}>
                  在完整编辑器中打开
                </Button>
                <Form.Item name="workflow_json" label="工作流源码 (JSON)" rules={[{ required: true }]}>
                  <Input.TextArea rows={10} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
                <Form.Item name="parameters" label="参数映射 (JSON)">
                  <Input.TextArea rows={5} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </>
            )}
          </Form>
        )}
      </Drawer>

      {/* 新建 Drawer */}
      <Drawer
        title="铸造新资产"
        width={480}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        extra={
          <Button type="primary" icon={<SaveOutlined />} loading={creatingSaving} onClick={handleCreateSave}>
            创建
          </Button>
        }
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="资产类型">
            <Segmented
              block
              options={[
                { label: '提示词', value: 'prompt' },
                { label: '图像', value: 'image' },
                { label: '视频', value: 'video' },
                { label: '工作流', value: 'workflow' },
              ]}
              value={createType}
              onChange={(val) => setCreateType(val as string)}
            />
          </Form.Item>
          <Form.Item name="name" label="资产名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <TagsInput />
          </Form.Item>

          <Divider dashed style={{ fontSize: 12, color: '#94a3b8' }}>模态数据</Divider>

          {createType === 'prompt' && (
            <>
              <Form.Item name="content" label="提示词内容" rules={[{ required: true }]}>
                <Input.TextArea rows={6} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
              <Form.Item name="negative" label="负面提示词">
                <Input.TextArea rows={3} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </>
          )}

          {createType === 'image' && (
            <>
              <Form.Item label="上传图片" required>
                <Upload.Dragger
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  showUploadList={false}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    const fd = new FormData();
                    fd.append('file', file as File);
                    try {
                      const res = await apiClient.post('/assets/upload/image', fd, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                      });
                      const info = res.data;
                      setCreateUploadedImage(info);
                      message.success('图片上传成功');
                      onSuccess?.(info);
                    } catch {
                      message.error('图片上传失败');
                      onError?.(new Error('upload failed'));
                    }
                  }}
                >
                  {createUploadedImage ? (
                    <div style={{ padding: 8 }}>
                      <img src={`/api/assets/media/${createUploadedImage.file_path}`} alt="preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }} />
                      <p style={{ marginTop: 8, color: '#52c41a', fontSize: 12 }}>
                        {createUploadedImage.width} x {createUploadedImage.height} · {createUploadedImage.format?.toUpperCase()}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 32, color: '#1890ff' }} /></p>
                      <p style={{ fontSize: 13 }}>点击或拖拽图片上传</p>
                      <p style={{ color: '#8c8c8c', fontSize: 12 }}>支持 PNG / JPEG / WebP / GIF</p>
                    </>
                  )}
                </Upload.Dragger>
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}><Form.Item label="宽度"><Input type="number" addonAfter="px" readOnly value={createUploadedImage?.width} /></Form.Item></Col>
                <Col span={8}><Form.Item label="高度"><Input type="number" addonAfter="px" readOnly value={createUploadedImage?.height} /></Form.Item></Col>
                <Col span={8}><Form.Item label="格式"><Input readOnly value={createUploadedImage?.format} /></Form.Item></Col>
              </Row>
            </>
          )}

          {createType === 'video' && (
            <>
              <Form.Item label="上传视频" required>
                <Upload.Dragger
                  accept="video/mp4,video/webm,video/quicktime"
                  showUploadList={false}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    const fd = new FormData();
                    fd.append('file', file as File);
                    try {
                      const res = await apiClient.post('/assets/upload/video', fd, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                      });
                      const info = res.data;
                      setCreateUploadedVideo(info);
                      message.success('视频上传成功');
                      onSuccess?.(info);
                    } catch {
                      message.error('视频上传失败');
                      onError?.(new Error('upload failed'));
                    }
                  }}
                >
                  {createUploadedVideo ? (
                    <div style={{ padding: 8 }}>
                      <VideoCameraOutlined style={{ fontSize: 32, color: '#eb2f96' }} />
                      <p style={{ marginTop: 8, color: '#52c41a', fontSize: 12 }}>
                        {createUploadedVideo.file_path?.split('/').pop()} · {createUploadedVideo.format?.toUpperCase()}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 32, color: '#eb2f96' }} /></p>
                      <p style={{ fontSize: 13 }}>点击或拖拽视频上传</p>
                      <p style={{ color: '#8c8c8c', fontSize: 12 }}>支持 MP4 / WebM / MOV</p>
                    </>
                  )}
                </Upload.Dragger>
              </Form.Item>
              <Row gutter={12}>
                <Col span={6}><Form.Item label="宽度"><Input type="number" addonAfter="px" readOnly value={createUploadedVideo?.width} /></Form.Item></Col>
                <Col span={6}><Form.Item label="高度"><Input type="number" addonAfter="px" readOnly value={createUploadedVideo?.height} /></Form.Item></Col>
                <Col span={6}><Form.Item label="时长"><Input type="number" addonAfter="s" readOnly value={createUploadedVideo?.duration} /></Form.Item></Col>
                <Col span={6}><Form.Item label="帧率"><Input type="number" addonAfter="fps" readOnly value={createUploadedVideo?.fps} /></Form.Item></Col>
              </Row>
              <Form.Item label="格式"><Input readOnly value={createUploadedVideo?.format} /></Form.Item>
            </>
          )}

          {createType === 'workflow' && (
            <>
              <Button type="link" style={{ padding: 0, marginBottom: 12 }} onClick={() => navigate(`/assets/workflow-config?returnUrl=${encodeURIComponent(canvasReturnUrl)}`)}>
                在完整编辑器中打开
              </Button>
              <Form.Item name="workflow_json" label="工作流源码 (JSON)" rules={[{ required: true }]}>
                <Input.TextArea rows={10} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
              <Form.Item name="parameters" label="参数映射 (JSON)">
                <Input.TextArea rows={5} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </>
          )}
        </Form>
      </Drawer>
    </div>
  );
};

const AssetItem: React.FC<{ asset: Asset; onAddToCanvas?: (asset: Asset) => void; onEdit?: (asset: Asset) => void; onDelete?: (asset: Asset) => void }> = ({ asset, onAddToCanvas, onEdit, onDelete }) => {
  const [hovered, setHovered] = useState(false);
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 12px',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        background: isDragging ? '#e6f7ff' : '#fff',
        cursor: 'grab',
        transition: 'all 0.2s',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.02)',
        position: 'relative',
      }}
      className="asset-item-hover"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {preview ? (
          <img
            src={preview.startsWith('http') || preview.startsWith('data:') ? preview : `/api/assets/media/${preview}`}
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

        {hovered && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {onAddToCanvas && (
              <Tooltip title="发送到画布">
                <Button
                  type="primary"
                  size="small"
                  icon={<SendOutlined />}
                  onClick={(e) => { e.stopPropagation(); onAddToCanvas(asset); }}
                />
              </Tooltip>
            )}
            {onEdit && (
              <Tooltip title="编辑资产">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => { e.stopPropagation(); onEdit(asset); }}
                />
              </Tooltip>
            )}
            {onDelete && (
              <Popconfirm
                title="确认删除该资产？"
                onConfirm={(e) => { e?.stopPropagation(); onDelete(asset); }}
                onCancel={(e) => e?.stopPropagation()}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="删除资产">
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </div>
        )}
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