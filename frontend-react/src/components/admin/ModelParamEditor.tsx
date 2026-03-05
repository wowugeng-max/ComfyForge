import React, { useState, useEffect } from 'react';
import { Modal, Input, message, Button, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  modelId: number;
  modelName: string;
  initialParams: any;
  onSuccess?: () => void;
}

// 🌟 这是一个高度解耦的插件组件
export const ModelParamEditor: React.FC<Props> = ({ modelId, modelName, initialParams, onSuccess }) => {
  const [visible, setVisible] = useState(false);
  const [jsonStr, setJsonStr] = useState('');
  const [saving, setSaving] = useState(false);

  // 打开弹窗时，将后端的 JSON 对象格式化为漂亮的字符串供编辑
  const handleOpen = () => {
    setJsonStr(JSON.stringify(initialParams || {}, null, 2));
    setVisible(true);
  };

  const handleSave = async () => {
    try {
      // 1. 校验用户手敲的 JSON 是否合法
      const parsedJson = JSON.parse(jsonStr);

      setSaving(true);
      // 2. 提交给后端
      await apiClient.put(`/models/${modelId}/ui-params`, {
        context_ui_params: parsedJson
      });

      message.success(`${modelName} 参数配置已热更新！`);
      setVisible(false);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        message.error('JSON 格式错误，请检查标点和引号！');
      } else {
        message.error('保存失败: ' + e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="link" size="small" icon={<EditOutlined />} onClick={handleOpen}>
        配置参数 (JSON)
      </Button>

      <Modal
        title={`⚙️ 高级配置: ${modelName}`}
        open={visible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setVisible(false)}
        width={600}
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            在这里修改该模型在节点中暴露的动态表单。保存后，所有画布节点立即生效，无需重启代码。
          </Text>
        </div>
        <TextArea
          rows={15}
          value={jsonStr}
          onChange={(e) => setJsonStr(e.target.value)}
          style={{ fontFamily: 'monospace', backgroundColor: '#fafafa' }}
        />
      </Modal>
    </>
  );
};