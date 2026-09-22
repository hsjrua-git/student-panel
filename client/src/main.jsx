import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext.jsx';
import { applyRememberedTheme } from './lib/theme.js';
import { PreferencesProvider } from './preferences/PreferencesContext.jsx';
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
      retry: (failureCount, error) =>
        error?.status === undefined && failureCount < 1,
    },
  },
});

createRoot(document.getElementById('root')).render(
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
  </StrictMode>
);