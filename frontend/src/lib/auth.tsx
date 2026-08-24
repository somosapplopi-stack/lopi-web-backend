import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getAuthToken, setAuthToken } from './api';

export type LopiUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  city: string;
  photo?: string | null;
  bio?: string;
  interests: string[];
  friends_count: number;
  followers_count: number;
  following_count: number;
};

type AuthState = {
  user: LopiUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<LopiUser>;
  register: (payload: {
    name: string; username: string; email: string; password: string; city: string; photo?: string | null;
  }) => Promise<LopiUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setInterests: (interests: string[]) => Promise<LopiUser>;
  updateProfile: (payload: Partial<Pick<LopiUser, 'name' | 'city' | 'photo' | 'bio'>>) => Promise<LopiUser>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LopiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) { setUser(null); return; }
    try {
      const me = await api<LopiUser>('/auth/me');
      setUser(me);
    } catch {
      await setAuthToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let done = false;
    // Safety net: never let the app hang on the bootstrap spinner. If storage or
    // the network is slow on web, still show the UI after a short timeout.
    const timer = setTimeout(() => { if (!done) setLoading(false); }, 4000);
    (async () => {
      await refresh();
      done = true;
      clearTimeout(timer);
      setLoading(false);
    })();
    return () => clearTimeout(timer);
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await api<{ access_token: string; user: LopiUser }>('/auth/login', {
      method: 'POST', body: { identifier, password }, auth: false,
    });
    await setAuthToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload: {
    name: string; username: string; email: string; password: string; city: string; photo?: string | null;
  }) => {
    const data = await api<{ access_token: string; user: LopiUser }>('/auth/register', {
      method: 'POST', body: payload, auth: false,
    });
    await setAuthToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await setAuthToken(null);
    setUser(null);
  }, []);

  const setInterests = useCallback(async (interests: string[]) => {
    const u = await api<LopiUser>('/auth/interests', { method: 'POST', body: { interests } });
    setUser(u);
    return u;
  }, []);

  const updateProfile = useCallback(async (payload: Partial<Pick<LopiUser, 'name' | 'city' | 'photo' | 'bio'>>) => {
    const u = await api<LopiUser>('/auth/profile', { method: 'PATCH', body: payload });
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, setInterests, updateProfile }),
    [user, loading, login, register, logout, refresh, setInterests, updateProfile]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
