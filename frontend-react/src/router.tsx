import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AssetList from './pages/Assets';
import AssetDetail from './pages/Assets/Detail';
import AssetCreate from './pages/Assets/Create';
import Pipeline from './pages/Pipeline';
import AssetEdit from './pages/Assets/Edit';
import KeyManager from './pages/Keys';
import VideoWorkshop from './pages/VideoWorkshop';
import WorkflowConfig from './pages/Assets/WorkflowConfig';
import RulesPage from './pages/Rules';
import CanvasPage from './pages/Canvas';
import ProviderManager from './pages/Providers'; // 🌟 引入新页面

const router = createBrowserRouter([
  // 🏠 空间 A：中枢大厅 (带有全局左侧侧边栏)
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'assets', element: <AssetList /> },
      { path: 'assets/create', element: <AssetCreate /> },
      { path: 'assets/:id', element: <AssetDetail /> },
      { path: 'video-workshop', element: <VideoWorkshop /> },
      { path: 'keys', element: <KeyManager /> },
      { path: 'pipeline', element: <Pipeline /> },
      { path: 'assets/:id/edit', element: <AssetEdit /> },
      { path: 'assets/workflow-config', element: <WorkflowConfig /> },
      { path: 'assets/workflow-config/:id?', element: <WorkflowConfig /> },
      { path: 'assets/workflow-config/:mode?/:id?', element: <WorkflowConfig /> },
      { path: 'rules', element: <RulesPage /> },
      // 保留一个旧的独立画布入口供测试用
      { path: 'canvas', element: <CanvasPage /> },
        { path: 'providers', element: <ProviderManager /> }, // 🌟 挂载新路由
    ],
  },
  // 🎨 空间 B：沉浸式创作台 (直接渲染画布，不包含任何全局菜单)
  {
    path: '/project/:id',
    element: <CanvasPage />
  }
]);

export default router;