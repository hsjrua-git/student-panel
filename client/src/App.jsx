import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import RequirePermission from './components/RequirePermission.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import { firstAllowedPath } from './lib/navigation.js';
import { lazyWithReload } from './lib/lazyWithReload.js';

// LoginPage stays eagerly imported: it is the first thing a signed-out visitor
// sees, so we don't want to make them wait for a second network round-trip
// before they can even log in. Every page behind auth is code-split with
// lazyWithReload() so its JavaScript is only downloaded when the user first
// navigates there — this keeps the initial download small, and a stale-chunk
// fetch after a redeploy self-heals with one reload instead of blanking the
// app. The <Suspense> boundary that covers these lives in Layout, around
// the <Outlet />.
import LoginPage from './pages/LoginPage.jsx';

const DashboardPage = lazyWithReload(() => import('./pages/DashboardPage.jsx'));
const StudentsPage = lazyWithReload(() => import('./pages/StudentsPage.jsx'));
const StudentDetailPage = lazyWithReload(() => import('./pages/StudentDetailPage.jsx'));
const EvaluatePage = lazyWithReload(() => import('./pages/EvaluatePage.jsx'));
const ParametersPage = lazyWithReload(() => import('./pages/ParametersPage.jsx'));
const ResultsPage = lazyWithReload(() => import('./pages/ResultsPage.jsx'));
const ImportStudentsPage = lazyWithReload(() => import('./pages/ImportStudentsPage.jsx'));
const ImportScoresPage = lazyWithReload(() => import('./pages/ImportScoresPage.jsx'));
const GroupsPage = lazyWithReload(() => import('./pages/GroupsPage.jsx'));
const FieldsPage = lazyWithReload(() => import('./pages/FieldsPage.jsx'));
const PreferencesPage = lazyWithReload(() => import('./pages/PreferencesPage.jsx'));
const SettingsPage = lazyWithReload(() => import('./pages/SettingsPage.jsx'));
const AuditPage = lazyWithReload(() => import('./pages/AuditPage.jsx'));
const NotFoundPage = lazyWithReload(() => import('./pages/NotFoundPage.jsx'));

// Sends a freshly signed-in user to the first page their role can actually
// open. This is why "/" and every login land somewhere useful instead of a
// hardcoded /dashboard the user might not have permission to see.
function LandingRedirect() {
  const { can } = useAuth();
  return <Navigate to={firstAllowedPath(can)} replace />;
}

function App() {
  return (
    <>
      <ConnectionBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route element={<RequirePermission />}>
              <Route path="/" element={<LandingRedirect />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/students/:id" element={<StudentDetailPage />} />
              <Route path="/evaluate" element={<EvaluatePage />} />
              <Route path="/parameters" element={<ParametersPage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/students/import" element={<ImportStudentsPage />} />
              <Route path="/evaluate/import" element={<ImportScoresPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/fields" element={<FieldsPage />} />
              <Route path="/preferences" element={<PreferencesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  );
}

export default App;
