import { Routes, Route } from 'react-router-dom';
import WorldListPage from './pages/WorldListPage.jsx';
import CreateWorldPage from './pages/CreateWorldPage.jsx';
import CreateCharacterPage from './pages/CreateCharacterPage.jsx';
import WorldPage from './pages/WorldPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorldListPage />} />
      <Route path="/create/world" element={<CreateWorldPage />} />
      <Route path="/create/character" element={<CreateCharacterPage />} />
      <Route path="/world/:worldId" element={<WorldPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
