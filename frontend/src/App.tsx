import { Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import BrowserSourcePage from './pages/BrowserSourcePage';
import DashboardPage from './pages/DashboardPage';
import ClipFormPage from './pages/ClipFormPage';
import LayoutAreasPage from './pages/LayoutAreasPage';

export default function App() {
  return (
    <Routes>
      <Route path="/overlay/browser" element={<BrowserSourcePage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clips/new" element={<ClipFormPage mode="create" />} />
        <Route path="/clips/:id/edit" element={<ClipFormPage mode="edit" />} />
        <Route path="/settings/layout-areas" element={<LayoutAreasPage />} />
      </Route>
    </Routes>
  );
}
