import React, { useState } from 'react';
import { Tag, Input } from 'antd';

// 可视化标签输入组件（兼容 Form.Item 的 value/onChange 协议）
const TagsInput: React.FC<{ value?: string; onChange?: (val: string) => void }> = ({ value = '', onChange }) => {
  const [inputVal, setInputVal] = useState('');
  const tags = value ? value.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

  const handleAdd = () => {
    const newTag = inputVal.trim();
    if (!newTag || tags.includes(newTag)) { setInputVal(''); return; }
    onChange?.([...tags, newTag].join(', '));
    setInputVal('');
  };

  const handleRemove = (tag: string) => {
    onChange?.(tags.filter(t => t !== tag).join(', '));
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {tags.map(tag => (
        <Tag key={tag} closable onClose={() => handleRemove(tag)} style={{ fontSize: 12 }}>{tag}</Tag>
      ))}
      <Input
        size="small"
        style={{ width: 100 }}
        placeholder="+TAG"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onPressEnter={handleAdd}
        onBlur={handleAdd}
      />
    </div>
  );
};

export default TagsInput;
