import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Card, message, Input, List, Space, Popconfirm } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { workflowToFlow } from '../../utils/workflowToFlow';
import { CustomNode } from '../../components/CustomNode';
import { ParamConfigPanel } from '../../components/ParamConfigPanel';
import { getAllSuggestions, reportStats, extractStatsFromParameters, type Suggestion } from '../../utils/workflowSuggestions';
import apiClient from '../../api/client';

const nodeTypes = { customNode: CustomNode };
const { Search } = Input;

export default function WorkflowConfig() {
  const { mode = 'edit', id } = useParams<{ mode?: string; id?: string }>();
  const isViewMode = mode === 'view';
  const isEditMode = mode === 'edit' || !mode;

  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeExistingParams, setNodeExistingParams] = useState<Record<string, string>>({});
  const [panelVisible, setPanelVisible] = useState(false);
  const [workflowJson, setWorkflowJson] = useState<any>(null);
  const [parameters, setParameters] = useState<Record<string, { node_id: string; field: string }>>({});
  const [assetName, setAssetName] = useState('');
  const [loading, setLoading] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [searchId, setSearchId] = useState('');
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, Suggestion[]>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 将 parameters 对象转换为数组便于渲染
  const paramList = Object.entries(parameters).map(([name, config]) => ({
    name,
    nodeId: config.node_id,
    field: config.field,
  }));

  // 通用函数：根据 workflowJson 更新节点图和推荐
  const updateWorkflowData = async (json: any) => {
    setWorkflowJson(json);
    const { nodes: flowNodes, edges: flowEdges } = workflowToFlow(json);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSuggestionsLoading(true);
    try {
      const sugs = await getAllSuggestions(json);
      setSuggestionsMap(sugs);
    } catch (error) {
      console.error('获取推荐失败', error);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  // 文件上传处理
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewMode) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        await updateWorkflowData(json);
        message.success('工作流加载成功');
      } catch (error) {
        message.error('JSON 格式错误');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 定位节点
  const handleLocateNode = (nodeId?: string) => {
    const targetId = nodeId || searchId.trim();
    if (!targetId) return;
    if (!reactFlowInstance) {
      message.warning('画布未初始化');
      return;
    }
    const node = nodes.find(n => n.id === targetId);
    if (!node) {
      message.error(`节点 ${targetId} 不存在`);
      return;
    }
    reactFlowInstance.setCenter(node.position.x, node.position.y, { duration: 800 });
    setNodes(nds =>
      nds.map(n => ({
        ...n,
        selected: n.id === targetId,
      }))
    );
  };

  // 加载资产数据（编辑或查看）
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
          setParameters(asset.data.parameters || {});
          await updateWorkflowData(asset.data.workflow_json);
        } catch (error) {
          message.error('加载失败');
        }
      };
      fetchAsset();
    }
  }, [id, navigate]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (isViewMode) {
      message.info('当前为只读模式，无法配置参数');
      return;
    }
    // 构建该节点已存在的参数映射
    const existing: Record<string, string> = {};
    Object.entries(parameters).forEach(([customName, config]) => {
      if (config.node_id === node.id) {
        const field = config.field.replace(/^inputs\//, '');
        existing[field] = customName;
      }
    });
    setSelectedNode(node);
    setNodeExistingParams(existing);
    setPanelVisible(true);
  }, [parameters, isViewMode]);

  // 保存参数配置（删除当前节点旧配置，合并新配置）
  const handleSaveParams = (newParams: Record<string, { node_id: string; field: string }>) => {
    if (isViewMode) return;
    setParameters(prev => {
      const filtered = Object.fromEntries(
        Object.entries(prev).filter(([_, config]) => config.node_id !== selectedNode?.id)
      );
      return { ...filtered, ...newParams };
    });
    setPanelVisible(false);
    message.success('参数配置已更新');
  };

  // 删除单个参数
  const handleRemoveParam = (paramName: string) => {
    if (isViewMode) return;
    setParameters(prev => {
      const { [paramName]: _, ...rest } = prev;
      return rest;
    });
    message.success(`参数 ${paramName} 已删除`);
  };

  // 保存工作流资产并上报统计
  const handleSaveAsset = async () => {
    if (isViewMode) return;
    if (!workflowJson) {
      message.warning('请先加载工作流');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        type: 'workflow',
        name: assetName || '未命名工作流',
        description: '',
        tags: [],
        data: {
          workflow_json: workflowJson,
          parameters: parameters,
        },
      };
      let savedId: number;
      if (id) {
        await apiClient.put(`/assets/${id}`, payload);
        savedId = parseInt(id);
        message.success('更新成功');
      } else {
        const res = await apiClient.post('/assets/', payload);
        savedId = res.data.id;
        message.success('创建成功');
        navigate(`/assets/${savedId}`);
      }

      // 上报统计（异步，不阻塞）
      const stats = extractStatsFromParameters(parameters, workflowJson);
      reportStats(stats).catch(e => console.error('上报统计失败', e));
    } catch (error) {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={isViewMode ? '查看工作流参数' : (id ? '编辑工作流参数' : '新建工作流参数')}>
      {/* 顶部工具栏 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          placeholder="资产名称"
          value={assetName}
          onChange={(e) => !isViewMode && setAssetName(e.target.value)}
          disabled={isViewMode}
          style={{ width: 250 }}
        />
        <Input
          type="file"
          accept=".json,application/json"
          onChange={handleFileUpload}
          ref={fileInputRef}
          disabled={isViewMode}
          style={{ width: 250 }}
        />
        <Input
          placeholder="节点ID"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          onPressEnter={() => handleLocateNode()}
          style={{ width: 120 }}
        />
        <Button onClick={() => handleLocateNode()}>定位</Button>
        {isEditMode && (
          <Button type="primary" onClick={handleSaveAsset} loading={loading}>
            保存资产
          </Button>
        )}
        <Button onClick={() => navigate('/assets')}>返回列表</Button>
      </div>

      {/* 画布区域 */}
      <div style={{ height: '60vh', border: '1px solid #ddd', marginBottom: 16 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          fitView
        >
          <Controls />
          <Background />
        </ReactFlow>
      </div>

      {/* 已配置参数列表 */}
      <Card
        size="small"
        title="已配置参数"
        extra={paramList.length > 0 ? `共 ${paramList.length} 个` : '暂无'}
        style={{ marginTop: 16 }}
      >
        {paramList.length > 0 ? (
          <List
            size="small"
            bordered
            dataSource={paramList}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => handleLocateNode(item.nodeId)}
                    title="定位到节点"
                  />,
                  !isViewMode && (
                    <Popconfirm
                      title="确定删除此参数？"
                      onConfirm={() => handleRemoveParam(item.name)}
                      okText="是"
                      cancelText="否"
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                ].filter(Boolean)}
              >
                <Space direction="vertical" size={0}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    节点 {item.nodeId} · {item.field}
                  </span>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999', padding: 12 }}>
            {isViewMode ? '暂无参数' : (suggestionsLoading ? '加载推荐中...' : '点击节点配置参数，已配置的参数将显示在这里')}
          </div>
        )}
      </Card>

      {/* 参数配置弹窗（只读模式下不显示） */}
      {!isViewMode && (
        <ParamConfigPanel
          visible={panelVisible}
          nodeData={selectedNode ? { id: selectedNode.id, inputs: selectedNode.data.inputs } : undefined}
          existingParams={nodeExistingParams}
          nodeSuggestions={suggestionsMap[selectedNode?.id || '']}
          onSave={handleSaveParams}
          onCancel={() => setPanelVisible(false)}
        />
      )}
    </Card>
  );
}