import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { changePassword, fetchMe, login, logout, setup } from '../api/auth.js';
import { AuthContext } from './AuthContext.jsx';

// Holds the single-operator auth state (from the `me` query) and the
// setup/login/logout/change-password mutations. There are no users, roles or
// permissions in this build: the session is either signed in (`authed`) or not,
// and `initialized` tells us whether a password has been chosen yet. The context
// object and the useAuth() hook live in AuthContext.jsx; keeping the provider in
// its own file is what lets Fast Refresh work cleanly.
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    // Re-check the session whenever the user returns to the tab, so an expiry
    // elsewhere bounces them to the login screen on the next glance.
    refetchOnWindowFocus: true,
  });
  const me = meQuery.data ?? null;

  function forgetEverythingExceptMe() {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'me',
    });
  }

  const setupMutation = useMutation({
    mutationFn: setup,
    onSuccess: (data) => {
      forgetEverythingExceptMe();
      queryClient.setQueryData(['me'], (prev) => ({ ...(prev ?? {}), ...data }));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      forgetEverythingExceptMe();
      queryClient.setQueryData(['me'], (prev) => ({
        ...(prev ?? {}),
        authed: true,
        initialized: true,
      }));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      forgetEverythingExceptMe();
      queryClient.setQueryData(['me'], (prev) => ({
        ...(prev ?? {}),
        authed: false,
      }));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const changePasswordMutation = useMutation({ mutationFn: changePassword });

  const value = {
    authed: Boolean(me?.authed),
    initialized: Boolean(me?.initialized),
    operatorName: me?.operatorName ?? 'operator',
    appTitle: me?.appTitle ?? null,
    isLoading: meQuery.isPending,
    loadError: meQuery.isError ? meQuery.error : null,
    setup: setupMutation,
    login: loginMutation,
    logout: logoutMutation,
    changePassword: changePasswordMutation,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
