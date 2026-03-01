import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Controls,
  Background,
    type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button, Card, message,Input  } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { workflowToFlow } from '../../utils/workflowToFlow';
import { CustomNode } from '../../components/CustomNode';
import { ParamConfigPanel } from '../../components/ParamConfigPanel';
import apiClient from '../../api/client';

const nodeTypes = { customNode: CustomNode };

export default function WorkflowConfig() {
  const { id } = useParams<{ id: string }>(); // 如果编辑现有资产，id 存在；新建则 id 为空
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [workflowJson, setWorkflowJson] = useState<any>(null);
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [assetName, setAssetName] = useState('');
  const [loading, setLoading] = useState(false);

  // 如果是编辑模式，加载现有资产数据
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
          setWorkflowJson(asset.data.workflow_json);
          setParameters(asset.data.parameters || {});
          const { nodes: flowNodes, edges: flowEdges } = workflowToFlow(asset.data.workflow_json);
          setNodes(flowNodes);
          setEdges(flowEdges);
        } catch (error) {
          message.error('加载失败');
        }
      };
      fetchAsset();
    }
  }, [id, navigate]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setPanelVisible(true);
  }, []);

  const handleSaveParams = (newParams: Record<string, { node_id: string; field: string }>) => {
    setParameters(newParams);
    setPanelVisible(false);
    message.success('参数配置已更新');
  };

  const handleSaveAsset = async () => {
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
      if (id) {
        await apiClient.put(`/assets/${id}`, payload);
        message.success('更新成功');
      } else {
        const res = await apiClient.post('/assets/', payload);
        message.success('创建成功');
        navigate(`/assets/${res.data.id}`);
      }
    } catch (error) {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={id ? '编辑工作流参数' : '新建工作流参数'}>
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="资产名称"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          style={{ width: 300, marginRight: 16 }}
        />
        <Button type="primary" onClick={handleSaveAsset} loading={loading}>
          保存资产
        </Button>
      </div>
      <div style={{ height: '70vh', border: '1px solid #ddd' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <ParamConfigPanel
        visible={panelVisible}
        nodeData={selectedNode ? { id: selectedNode.id, inputs: selectedNode.data.inputs } : undefined}
        onSave={handleSaveParams}
        onCancel={() => setPanelVisible(false)}
      />
    </Card>
  );
}