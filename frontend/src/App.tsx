import { Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import BrowserSourcePage from './pages/BrowserSourcePage';
import AlertsOverlayPage from './pages/AlertsOverlayPage';
import DashboardPage from './pages/DashboardPage';
import ClipFormPage from './pages/ClipFormPage';
import LayoutAreasPage from './pages/LayoutAreasPage';
import ChecklistsListPage from './pages/ChecklistsListPage';
import ChecklistEditorPage from './pages/ChecklistEditorPage';
import GifsPage from './pages/GifsPage';
import BrowseCategoriesPage from './pages/BrowseCategoriesPage';
import BrowseCategoryClipsPage from './pages/BrowseCategoryClipsPage';
import TwitchPresetsPage from './pages/TwitchPresetsPage';
import AlertTriggersPage from './pages/AlertTriggersPage';
import StreamerBotEventsPage from './pages/StreamerBotEventsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/overlay/browser" element={<BrowserSourcePage />} />
      <Route path="/overlay/alerts" element={<AlertsOverlayPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/browse" element={<BrowseCategoriesPage />} />
        <Route path="/browse/favorites" element={<BrowseCategoryClipsPage />} />
        <Route path="/browse/categories/:categoryId" element={<BrowseCategoryClipsPage />} />
        <Route path="/checklists" element={<ChecklistsListPage />} />
        <Route path="/gifs" element={<GifsPage />} />
        <Route path="/checklists/:id" element={<ChecklistEditorPage mode="edit" />} />
        <Route path="/clips/new" element={<ClipFormPage mode="create" />} />
        <Route path="/clips/:id/edit" element={<ClipFormPage mode="edit" />} />
        <Route path="/settings/layout-areas" element={<LayoutAreasPage />} />
        <Route path="/settings/twitch-presets" element={<TwitchPresetsPage />} />
        <Route path="/settings/alert-triggers" element={<AlertTriggersPage />} />
        <Route path="/settings/streamerbot-events" element={<StreamerBotEventsPage />} />
      </Route>
    </Routes>
  );
}
