import { Layout as AntLayout, Menu } from 'antd';
import { Outlet, Link } from 'react-router-dom';
import {
  DashboardOutlined,
  FileImageOutlined,
  VideoCameraOutlined,
  KeyOutlined,
  ApiOutlined,
} from '@ant-design/icons';

const { Header, Content, Sider } = AntLayout;

export default function Layout() {
  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider>
        <div style={{ height: 32, margin: 16, color: '#fff', fontSize: 18, textAlign: 'center' }}>
          ComfyForge
        </div>
        <Menu
        theme="dark"
        mode="inline"
        defaultSelectedKeys={['dashboard']}
  items={[
    { key: 'dashboard', icon: <DashboardOutlined />, label: <Link to="/">仪表盘</Link> },
    { key: 'assets', icon: <FileImageOutlined />, label: <Link to="/assets">资产管理</Link> },
    { key: 'video', icon: <VideoCameraOutlined />, label: <Link to="/video-workshop">视频工坊</Link> },
    { key: 'keys', icon: <KeyOutlined />, label: <Link to="/keys">Key管理</Link> },
    { key: 'pipeline', icon: <ApiOutlined />, label: <Link to="/pipeline">图像生成管道</Link> },
  ]}
/>
      </Sider>
      <AntLayout>
        <Header style={{ background: '#fff', padding: 0, paddingLeft: 16 }}>
          <h2>ComfyForge 智能创作助理</h2>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet /> {/* 这里会渲染当前路由对应的子页面 */}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}