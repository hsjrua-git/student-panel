import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import EvaluatePage from './pages/EvaluatePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ParametersPage from './pages/ParametersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import StudentDetailPage from './pages/StudentDetailPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import PreferencesPage from './pages/PreferencesPage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/students" replace />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/evaluate" element={<EvaluatePage />} />
          <Route path="/parameters" element={<ParametersPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="*" element={<NotFoundPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;