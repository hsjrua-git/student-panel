import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';

// LoginPage stays eagerly imported: it is the first thing a signed-out visitor
// sees, so we don't want to make them wait for a second network round-trip
// before they can even log in. Every page behind auth is code-split with
// lazy() so its JavaScript is only downloaded when the user first navigates
// there — this keeps the initial download small. The <Suspense> boundary that
// covers these lives in Layout, around the <Outlet />.
import LoginPage from './pages/LoginPage.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const StudentsPage = lazy(() => import('./pages/StudentsPage.jsx'));
const StudentDetailPage = lazy(() => import('./pages/StudentDetailPage.jsx'));
const EvaluatePage = lazy(() => import('./pages/EvaluatePage.jsx'));
const ParametersPage = lazy(() => import('./pages/ParametersPage.jsx'));
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'));
const ImportStudentsPage = lazy(() => import('./pages/ImportStudentsPage.jsx'));
const ImportScoresPage = lazy(() => import('./pages/ImportScoresPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const RolesPage = lazy(() => import('./pages/RolesPage.jsx'));
const GroupsPage = lazy(() => import('./pages/GroupsPage.jsx'));
const FieldsPage = lazy(() => import('./pages/FieldsPage.jsx'));
const PreferencesPage = lazy(() => import('./pages/PreferencesPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

function App() {
  return (
    <>
      <ConnectionBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentDetailPage />} />
            <Route path="/evaluate" element={<EvaluatePage />} />
            <Route path="/parameters" element={<ParametersPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/students/import" element={<ImportStudentsPage />} />
            <Route path="/evaluate/import" element={<ImportScoresPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/fields" element={<FieldsPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}

export default App;
