import { Layout as AntLayout, Menu } from 'antd';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  FileImageOutlined,
  KeyOutlined,
  ApiOutlined,
  SettingOutlined,
    BlockOutlined,
} from '@ant-design/icons';

const { Content, Sider } = AntLayout;

export default function Layout() {
  const location = useLocation();

  // 🌟 智能判断当前高亮的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path.startsWith('/assets')) return 'assets';
    if (path.startsWith('/keys')) return 'keys';
    if (path.startsWith('/providers')) return 'providers'; // 🌟 识别高亮
    if (path.startsWith('/rules')) return 'rules';
    if (path.startsWith('/pipeline')) return 'pipeline';
    return 'dashboard';
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      {/* 🌟 侧边栏改为现代化的极简白色风格 */}
      <Sider theme="light" width={240} style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 24,
          fontSize: 20,
          fontWeight: 900,
          color: '#1890ff',
          letterSpacing: 1
        }}>
          ComfyForge
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          style={{ borderRight: 0, padding: '0 8px' }}
          items={[
            { key: 'dashboard', icon: <HomeOutlined />, label: <Link to="/">我的项目</Link> },
            { key: 'assets', icon: <FileImageOutlined />, label: <Link to="/assets">全局资产库</Link> },
            { type: 'divider' }, // 优雅的分割线
            { key: 'keys', icon: <KeyOutlined />, label: <Link to="/keys">算力与模型 (Keys)</Link> },
              { key: 'providers', icon: <BlockOutlined />, label: <Link to="/providers">厂商中枢 (Providers)</Link> }, // 🌟 侧边栏入口
            { key: 'pipeline', icon: <ApiOutlined />, label: <Link to="/pipeline">图像生成管道</Link> },
            { key: 'rules', icon: <SettingOutlined />, label: <Link to="/rules">系统推荐规则</Link> },
          ]}
        />
      </Sider>

      {/* 🌟 主体内容区，去掉了多余的 Header，让子页面的标题直接顶天立地 */}
      <AntLayout style={{ background: '#f5f7fa' }}>
        <Content style={{ margin: 0, overflow: 'auto' }}>
          <Outlet /> {/* 这里渲染 Dashboard 等中枢页面 */}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}