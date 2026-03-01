import React, { useState } from 'react';
import { Button, Form, Input, Space, Card, message, Select, Spin } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { Option } = Select;

interface Segment {
  frame_a_asset_id: number;
  frame_b_asset_id: number;
  prompt_asset_id: number;
}

export default function VideoWorkshop() {
  const [workflowAssetId, setWorkflowAssetId] = useState<number | undefined>();
  const [segments, setSegments] = useState<Segment[]>([
    { frame_a_asset_id: 0, frame_b_asset_id: 0, prompt_asset_id: 0 },
  ]);
  const [backend, setBackend] = useState<'local' | 'cloud'>('local');
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleAddSegment = () => {
    setSegments([...segments, { frame_a_asset_id: 0, frame_b_asset_id: 0, prompt_asset_id: 0 }]);
  };

  const handleRemoveSegment = (index: number) => {
    const newSegments = segments.filter((_, i) => i !== index);
    setSegments(newSegments);
  };

  const handleSegmentChange = (index: number, field: keyof Segment, value: number) => {
    const newSegments = [...segments];
    newSegments[index][field] = value;
    setSegments(newSegments);
  };

  const handleGenerate = async () => {
    if (!workflowAssetId) {
      message.warning('请输入工作流资产ID');
      return;
    }
    const validSegments = segments.filter(
      (s) => s.frame_a_asset_id && s.frame_b_asset_id && s.prompt_asset_id
    );
    if (validSegments.length === 0) {
      message.warning('至少需要一个有效的段落');
      return;
    }

    setLoading(true);
    setVideoUrl(null);
    try {
      const endpoint = backend === 'local' ? '/tasks/real_video_loop' : '/tasks/cloud_video_loop';
      const response = await apiClient.post(endpoint, {
        workflow_asset_id: workflowAssetId,
        segments: validSegments,
        project_id: null,
        source_asset_ids: [],
      });
      const data = response.data;
      if (data.final_video) {
        const fileName = data.final_video.split('\\').pop()?.split('/').pop();
        setVideoUrl(`http://localhost:8000/api/files/${fileName}`);
        message.success('视频生成成功！');
      } else {
        message.error('生成失败：未返回视频路径');
      }
    } catch (error) {
      message.error('生成失败，请检查后端');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>视频工坊</h1>
      <Card>
        <Form layout="vertical">
          <Form.Item label="工作流资产ID" required>
            <Input
              type="number"
              value={workflowAssetId}
              onChange={(e) => setWorkflowAssetId(parseInt(e.target.value) || undefined)}
              placeholder="请输入工作流资产ID"
            />
          </Form.Item>

          <Form.Item label="执行后端">
            <Select value={backend} onChange={(value) => setBackend(value)}>
              <Option value="local">本地 (5090)</Option>
              <Option value="cloud">云端 RunningHub</Option>
            </Select>
          </Form.Item>

          <Form.Item label="段落定义">
            {segments.map((seg, index) => (
              <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Input
                  placeholder="首帧资产ID"
                  type="number"
                  value={seg.frame_a_asset_id || ''}
                  onChange={(e) => handleSegmentChange(index, 'frame_a_asset_id', parseInt(e.target.value) || 0)}
                  style={{ width: 120 }}
                />
                <Input
                  placeholder="尾帧资产ID"
                  type="number"
                  value={seg.frame_b_asset_id || ''}
                  onChange={(e) => handleSegmentChange(index, 'frame_b_asset_id', parseInt(e.target.value) || 0)}
                  style={{ width: 120 }}
                />
                <Input
                  placeholder="提示词资产ID"
                  type="number"
                  value={seg.prompt_asset_id || ''}
                  onChange={(e) => handleSegmentChange(index, 'prompt_asset_id', parseInt(e.target.value) || 0)}
                  style={{ width: 120 }}
                />
                <MinusCircleOutlined onClick={() => handleRemoveSegment(index)} />
              </Space>
            ))}
            <Button type="dashed" onClick={handleAddSegment} icon={<PlusOutlined />}>
              添加段落
            </Button>
          </Form.Item>

          <Form.Item>
            <Button type="primary" onClick={handleGenerate} loading={loading}>
              一键生成
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {loading && (
        <Card style={{ marginTop: 24, textAlign: 'center' }}>
          <Spin tip="生成中，请稍候..." />
        </Card>
      )}

      {videoUrl && (
        <Card title="生成结果" style={{ marginTop: 24 }}>
          <video controls width="100%" src={videoUrl}>
            <track kind="captions" />
            您的浏览器不支持视频标签。
          </video>
        </Card>
      )}
    </div>
  );
}