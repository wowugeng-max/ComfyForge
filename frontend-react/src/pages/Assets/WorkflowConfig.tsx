import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Card, message, Input, List, Space, Popconfirm, Row, Col, Typography, Select, Tag, Divider } from 'antd';
import { DeleteOutlined, EyeOutlined, UploadOutlined, ArrowLeftOutlined, SaveOutlined, GlobalOutlined, ApiOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { workflowToFlow } from '../../utils/workflowToFlow';
import { CustomNode } from '../../components/CustomNode';
import { ParamConfigPanel } from '../../components/ParamConfigPanel';
import { BulkParamConfigPanel } from '../../components/BulkParamConfigPanel';
import { getAllSuggestions, reportStats, extractStatsFromParameters, type Suggestion } from '../../utils/workflowSuggestions';
import apiClient from '../../api/client';
import { projectApi } from '../../api/projects'; // 🌟 引入项目 API

const nodeTypes = { customNode: CustomNode };
const { Title, Text } = Typography;
const { Option } = Select;

// 定义常量，用于稳定空对象/空数组引用
const EMPTY_OBJECT = {};
const EMPTY_ARRAY: Suggestion[] = [];

export default function WorkflowConfig() {
  const { mode = 'edit', id } = useParams<{ mode?: string; id?: string }>();
  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit' || !mode;

  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeExistingParams, setNodeExistingParams] = useState<Record<string, string>>(EMPTY_OBJECT);
  const [panelVisible, setPanelVisible] = useState(false);
  const [bulkPanelVisible, setBulkPanelVisible] = useState(false);
  const [workflowJson, setWorkflowJson] = useState<any>(null);
  const [parameters, setParameters] = useState<Record<string, { node_id: string; field: string }>>({});

  const [assetName, setAssetName] = useState('');
  // 🌟 新增：项目绑定状态
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [projects, setProjects] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [searchId, setSearchId] = useState('');
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, Suggestion[]>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🌟 挂载时拉取项目列表
  useEffect(() => {
    projectApi.getAll().then(res => {
      setProjects(res.data);
    }).catch(() => {
      message.error('无法加载项目列表');
    });
  }, []);

  const paramList = Object.entries(parameters).map(([name, config]) => ({
    name,
    nodeId: config.node_id,
    field: config.field,
  }));

  const updateWorkflowData = useCallback(async (json: any) => {
    setWorkflowJson(json);
    const { nodes: flowNodes, edges: flowEdges } = workflowToFlow(json);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSuggestionsLoading(true);
    try {
      const sugs = await getAllSuggestions(json);
      setSuggestionsMap(sugs);
      if (!id && Object.keys(sugs).length > 0) {
        setBulkPanelVisible(true);
      }
    } catch (error) {
      console.error('获取推荐失败', error);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [id, setNodes, setEdges]);

  const handleRefreshSuggestions = useCallback(async () => {
    if (!workflowJson) return message.warning('请先加载工作流');
    setSuggestionsLoading(true);
    try {
      const sugs = await getAllSuggestions(workflowJson);
      setSuggestionsMap(sugs);
      if (Object.keys(sugs).length > 0) {
        setBulkPanelVisible(true);
      } else {
        message.info('没有新的推荐');
      }
    } catch (error) {
      message.error('刷新推荐失败');
    } finally {
      setSuggestionsLoading(false);
    }
  }, [workflowJson]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewMode) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        await updateWorkflowData(json);
        message.success('🎉 工作流蓝图加载成功');
      } catch (error) {
        message.error('JSON 格式错误');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLocateNode = (nodeId?: string) => {
    const targetId = nodeId || searchId.trim();
    if (!targetId) return;
    if (!reactFlowInstance) return message.warning('画布未初始化');
    const node = nodes.find(n => n.id === targetId);
    if (!node) return message.error(`节点 ${targetId} 不存在`);
    reactFlowInstance.setCenter(node.position.x, node.position.y, { duration: 800 });
    setNodes(nds => nds.map(n => ({ ...n, selected: n.id === targetId })));
  };

  useEffect(() => {
    if (id) {
      const fetchAsset = async () => {
        try {
          const res = await apiClient.get(`/assets/${id}`);
          const asset = res.data;
          if (asset.type !== 'workflow') {
            message.error('该资产不是工作流类型');
            navigate('/assets');
            return;
          }
          setAssetName(asset.name);
          setProjectId(asset.project_id); // 🌟 回显项目 ID
          setParameters(asset.data.parameters || {});
          await updateWorkflowData(asset.data.workflow_json);
        } catch (error) {
          message.error('加载失败');
        }
      };
      fetchAsset();
    }
  }, [id, navigate, updateWorkflowData]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (isViewMode) return message.info('当前为只读模式，无法配置参数');
    const existing: Record<string, string> = {};
    Object.entries(parameters).forEach(([customName, config]) => {
      if (config.node_id === node.id) {
        const field = config.field.replace(/^inputs\//, '');
        existing[field] = customName;
      }
    });
    setSelectedNode(node);
    setNodeExistingParams(Object.keys(existing).length === 0 ? EMPTY_OBJECT : existing);
    setPanelVisible(true);
  }, [parameters, isViewMode]);

  const handleSaveParams = useCallback((newParams: Record<string, { node_id: string; field: string }>) => {
    if (isViewMode) return;
    setParameters(prev => {
      const filtered = Object.fromEntries(Object.entries(prev).filter(([_, config]) => config.node_id !== selectedNode?.id));
      return { ...filtered, ...newParams };
    });
    setPanelVisible(false);
    message.success('参数映射已更新');
  }, [selectedNode, isViewMode]);

  const handleBulkSave = useCallback((newParams: Record<string, { node_id: string; field: string }>) => {
    if (isViewMode) return;
    setParameters(prev => ({ ...prev, ...newParams }));
    setBulkPanelVisible(false);
    message.success('批量参数映射已更新');
  }, [isViewMode]);

  const handleRemoveParam = (paramName: string) => {
    if (isViewMode) return;
    setParameters(prev => {
      const { [paramName]: _, ...rest } = prev;
      return rest;
    });
    message.success(`参数 ${paramName} 已删除`);
  };

  const handleSaveAsset = async () => {
    if (isViewMode) return;
    if (!workflowJson) return message.warning('请先加载工作流 JSON');
    if (!assetName.trim()) return message.warning('请填写工作流名称');

    setLoading(true);
    try {
      const payload = {
        type: 'workflow',
        name: assetName,
        description: '',
        tags: [],
        data: { workflow_json: workflowJson, parameters: parameters },
        project_id: projectId || null, // 🌟 保存时带上 project_id
      };

      let savedId: number;
      if (id) {
        await apiClient.put(`/assets/${id}`, payload);
        savedId = parseInt(id);
        message.success('🎉 工作流更新成功');
      } else {
        const res = await apiClient.post('/assets/', payload);
        savedId = res.data.id;
        message.success('🎉 工作流铸造成功');
        navigate(`/assets/workflow-config/edit/${savedId}`, { replace: true });
      }

      const stats = extractStatsFromParameters(parameters, workflowJson);
      reportStats(stats).catch(e => console.error('上报统计失败', e));
    } catch (error) {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const nodeDataForPanel = useMemo(() => {
    if (!selectedNode) return undefined;
    return { id: selectedNode.id, inputs: selectedNode.data.inputs };
  }, [selectedNode]);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '24px 32px' }}>

      {/* ================= 🌟 顶部全局操作条 ================= */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Space size="middle">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')} type="text" style={{ fontSize: 16, color: '#64748b' }} />
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            {isViewMode ? '查看工作流配置' : (id ? '编辑工作流配置' : '新建工作流配置')}
          </Title>
          <Tag color="purple" style={{ margin: 0, borderRadius: 16, border: 'none' }}><ApiOutlined /> 蓝图模式</Tag>
        </Space>
        <Space>
          <Button onClick={() => navigate('/assets')}>返回</Button>
          {!isViewMode && (
            <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSaveAsset}>
              固化保存
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={24}>
        {/* ================= 🌟 左侧：画布与操作视窗 ================= */}
        <Col span={16}>
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', height: '100%' }} bodyStyle={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <Space>
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} ref={fileInputRef} style={{ display: 'none' }} />
                {!isViewMode && (
                  <Button type="dashed" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                    导入 API JSON
                  </Button>
                )}
                {isEditMode && (
                  <Button onClick={handleRefreshSuggestions} loading={suggestionsLoading}>
                    魔法推荐参数
                  </Button>
                )}
              </Space>
              <Space.Compact>
                <Input placeholder="输入节点 ID 定位..." value={searchId} onChange={(e) => setSearchId(e.target.value)} onPressEnter={() => handleLocateNode()} style={{ width: 150 }} />
                <Button onClick={() => handleLocateNode()}>定位</Button>
              </Space.Compact>
            </div>

            <div style={{ flex: 1, background: '#f0f2f5', borderRadius: 8, overflow: 'hidden', minHeight: 600, border: '1px solid #e2e8f0' }}>
              <ReactFlow
                nodes={nodes} edges={edges}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                onInit={setReactFlowInstance}
                fitView
                minZoom={0.1}
              >
                <Controls style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                <Background color="#ccc" gap={16} />
              </ReactFlow>
            </div>
          </Card>
        </Col>

        {/* ================= 🌟 右侧：元数据与参数面板 ================= */}
        <Col span={8} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* 元数据卡片 */}
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <Title level={5} style={{ marginBottom: 20 }}>基础档案</Title>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>工作流名称</Text>
              <Input size="large" placeholder="给蓝图起个名字..." value={assetName} onChange={(e) => setAssetName(e.target.value)} disabled={isViewMode} />
            </div>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>归属沙盒作用域</Text>
              <Select
                size="large"
                placeholder={<span><GlobalOutlined /> 设为全局公共工作流</span>}
                allowClear showSearch optionFilterProp="children"
                value={projectId} onChange={setProjectId}
                disabled={isViewMode}
                style={{ width: '100%' }}
              >
                {projects.map(p => <Option key={p.id} value={p.id}>📦 {p.name}</Option>)}
              </Select>
            </div>
          </Card>

          {/* 参数映射卡片 */}
          <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)', flex: 1, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>已暴露参数映射</Title>
              <Tag color="blue">{paramList.length} 个参数</Tag>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {paramList.length > 0 ? (
                <List
                  size="small"
                  dataSource={paramList}
                  renderItem={(item) => (
                    <List.Item
                      style={{ background: '#f8fafc', borderRadius: 6, marginBottom: 8, padding: '8px 12px', border: '1px solid #f0f0f0' }}
                      actions={[
                        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleLocateNode(item.nodeId)} title="在蓝图中定位" />,
                        !isViewMode && (
                          <Popconfirm title="移除此参数？" onConfirm={() => handleRemoveParam(item.name)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        ),
                      ].filter(Boolean)}
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Text strong style={{ color: '#0958d9', fontSize: 13 }}>{item.name}</Text>
                        <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>Node #{item.nodeId} ➔ {item.field}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>
                  {isViewMode ? '暂无参数配置' : (suggestionsLoading ? '计算推荐参数中...' : '点击左侧蓝图中的节点，添加需要动态替换的参数')}
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 弹窗组件保持不变 */}
      <BulkParamConfigPanel visible={bulkPanelVisible} suggestionsMap={suggestionsMap} workflowJson={workflowJson} onSave={handleBulkSave} onCancel={() => setBulkPanelVisible(false)} />
      {!isViewMode && <ParamConfigPanel visible={panelVisible} nodeData={nodeDataForPanel} existingParams={nodeExistingParams} nodeSuggestions={suggestionsMap[selectedNode?.id || ''] || EMPTY_ARRAY} onSave={handleSaveParams} onCancel={() => setPanelVisible(false)} />}
    </div>
  );
}