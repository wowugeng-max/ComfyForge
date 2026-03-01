import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AssetList from './pages/Assets';
import AssetDetail from './pages/Assets/Detail';
import AssetCreate from './pages/Assets/Create';
import Pipeline from './pages/Pipeline';
import AssetEdit from './pages/Assets/Edit';  // 确认路径正确
import KeyManager from './pages/Keys';
import VideoWorkshop from './pages/VideoWorkshop';

const router = createBrowserRouter([
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
      { path: 'assets/:id/edit', element: <AssetEdit /> }
    ],
  },
]);

export default router;