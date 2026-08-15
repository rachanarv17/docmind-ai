import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '../../types';
import {
  getStoredUser,
  getMeApi,
  loginApi,
  registerApi,
  logoutApi,
} from './authClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: 'USER' | 'ADMIN') => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const current = await getMeApi();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await loginApi({ email, password });
    setUser(res.user);
  };

  const register = async (name: string, email: string, password: string, role?: 'USER' | 'ADMIN') => {
    const res = await registerApi({ name, email, password, role });
    setUser(res.user);
  };

  const logout = async () => {
    await logoutApi();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: Boolean(user && user.status === 'ACTIVE'),
    isLoading,
    isAdmin: user?.role === 'ADMIN',
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
