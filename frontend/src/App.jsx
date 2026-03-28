import { Routes, Route } from 'react-router-dom';
import WorldListPage from './pages/WorldListPage.jsx';
import CreateWorldPage from './pages/CreateWorldPage.jsx';
import CreateCharacterPage from './pages/CreateCharacterPage.jsx';
import WorldPage from './pages/WorldPage.jsx';
import SetupPage from './pages/SetupPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import WorldArchivePage from './pages/WorldArchivePage.jsx';
import ApiSetupGuard from './components/ApiSetupGuard.jsx';

export default function App() {
  return (
    <ApiSetupGuard>
      <Routes>
        <Route path="/" element={<WorldListPage />} />
        <Route path="/create/world" element={<CreateWorldPage />} />
        <Route path="/create/character" element={<CreateCharacterPage />} />
        <Route path="/world/:worldId/setup" element={<SetupPage />} />
        <Route path="/world/:worldId" element={<WorldPage />} />
        <Route path="/world/:worldId/archive" element={<WorldArchivePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </ApiSetupGuard>
  );
}
