import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/students" replace />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;