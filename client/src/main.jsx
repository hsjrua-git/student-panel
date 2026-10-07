import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { applyRememberedTheme } from './lib/theme.js';
import { PreferencesProvider } from './preferences/PreferencesProvider.jsx';
import { initLocalDb } from './db/bootstrap.js';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

applyRememberedTheme();

function signOutOn401(error) {
  if (error?.status === 401) {
    queryClient.setQueryData(['me'], null);
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signOutOn401 }),
  mutationCache: new MutationCache({ onError: signOutOn401 }),
  defaultOptions: {
    queries: {
      // Treat fetched data as fresh for 30s. Without this, react-query's default
      // staleTime of 0 refetches on every component mount and every window
      // refocus — a lot of needless traffic for data that changes slowly. After
      // a mutation we still invalidate the affected keys explicitly, so edits
      // show up immediately regardless of staleTime.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A tab-switch shouldn't re-hit the server for data that is still fresh;
      // staleTime already gates this, and explicit invalidation covers writes.
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        error?.status === undefined && failureCount < 1,
    },
  },
});

const root = createRoot(document.getElementById('root'));

// The full application tree. Kept as a factory (not a named component) so this
// entry module has no component exports — Fast Refresh only tracks modules that
// export their components, and the entry point intentionally exports nothing.
function renderApp() {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <BrowserRouter>
            <AuthProvider>
              <PreferencesProvider>
                <App />
              </PreferencesProvider>
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
}

// A tiny inline splash shown while the on-device database starts up (creating
// PGlite, applying migrations, seeding the local user). This runs before any
// React/API code, so nothing queries the DB until it is ready.
function renderSplash(message) {
  root.render(
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        font: '500 15px/1.5 system-ui, sans-serif',
        color: 'var(--fg, #333)',
        textAlign: 'center',
      }}
    >
      <p>{message}</p>
    </div>,
  );
}

// Gate the app on the local database. Unlike the desktop build (which talks to a
// running Postgres server), here the database has to be created in the browser
// first — so we wait for it, then mount. On failure we show the error rather
// than a blank screen.
renderSplash('Starting…');
initLocalDb().then(renderApp, (error) => {
  console.error('Failed to start the local database:', error);
  renderSplash(`Could not start the local database: ${error.message}`);
});