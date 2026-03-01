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
        <Menu theme="dark" mode="inline" defaultSelectedKeys={['dashboard']}>
          <Menu.Item key="dashboard" icon={<DashboardOutlined />}>
            <Link to="/">仪表盘</Link>
          </Menu.Item>
          <Menu.Item key="assets" icon={<FileImageOutlined />}>
            <Link to="/assets">资产管理</Link>
          </Menu.Item>
          <Menu.Item key="video" icon={<VideoCameraOutlined />}>
            <Link to="/video-workshop">视频工坊</Link>
          </Menu.Item>
          <Menu.Item key="keys" icon={<KeyOutlined />}>
            <Link to="/keys">Key管理</Link>
          </Menu.Item>
          <Menu.Item key="pipeline" icon={<ApiOutlined />}>
            <Link to="/pipeline">图像生成管道</Link>
          </Menu.Item>
        </Menu>
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