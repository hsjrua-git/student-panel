import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPreferences,
  resetPreferences,
  savePreferences,
} from '../api/preferences.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { applyTheme } from '../lib/theme.js';
import { DEFAULT_PREFERENCES } from './defaults.js';
import { PreferencesContext } from './PreferencesContext.jsx';

const KEY = ['preferences'];

// Loads the signed-in user's preferences, applies their theme, and exposes
// optimistic `update`/`reset` mutations. The context object and the
// usePreferences() hook live in PreferencesContext.jsx; keeping this provider
// component in its own file is what lets Fast Refresh work cleanly.
export function PreferencesProvider({ children }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const enabled = user !== null && !user.mustChangePassword;

  const query = useQuery({
    queryKey: KEY,
    queryFn: getPreferences,
    enabled,
    retry: false,
  });
  const preferences = query.data ?? DEFAULT_PREFERENCES;
  const ready = !enabled || query.isSuccess || query.isError;

  const theme = query.data?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const update = useMutation({
    mutationKey: KEY,
    mutationFn: savePreferences,
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData(KEY);
      queryClient.setQueryData(KEY, {
        ...(previous ?? DEFAULT_PREFERENCES),
        ...changes,
      });
      return { previous };
    },
    onError: (error, changes, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: KEY }) === 1) {
        queryClient.invalidateQueries({ queryKey: KEY });
      }
    },
  });

  const reset = useMutation({
    mutationFn: resetPreferences,
    onSuccess: (saved) => queryClient.setQueryData(KEY, saved),
  });

  const value = { preferences, update, reset };

  return (
    <PreferencesContext.Provider value={value}>
      {ready ? (
        children
      ) : (
        <main>
          <p>Loading...</p>
        </main>
      )}
    </PreferencesContext.Provider>
  );
}
