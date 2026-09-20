import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { changePassword, fetchMe, login, logout } from '../api/auth.js';
import { hasAtLeast } from './roles.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  });
  const user = meQuery.data ?? null;

  function forgetEverythingExceptMe() {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'me',
    });
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (signedInUser) => {
      forgetEverythingExceptMe();
      queryClient.setQueryData(['me'], signedInUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      forgetEverythingExceptMe();
      queryClient.setQueryData(['me'], null);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['me'], updatedUser);
    },
  });

  const value = {
    user,
    isLoading: meQuery.isPending,
    loadError: meQuery.isError ? meQuery.error : null,
    can: (minRole) => user !== null && hasAtLeast(user.role, minRole),
    login: loginMutation,
    logout: logoutMutation,
    changePassword: changePasswordMutation,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}