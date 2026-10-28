import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, SESSION_EXPIRED_EVENT, tokenStore } from '../api/client';
import { fetchCurrentAdmin, login as loginRequest, logout as logoutRequest } from '../api/endpoints';
import type { AdminAccount } from '../api/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  admin: AdminAccount | null;
  /** True when the signed-in admin holds every listed permission. */
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Re-reads the signed-in admin from the server.
   *
   * Needed after a change that alters what this account is allowed to do without issuing
   * new tokens: clearing a forced password change, or having a role edited underneath you.
   */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [admin, setAdmin] = useState<AdminAccount | null>(null);

  // Restore an existing session on load, so a refresh does not sign the admin out.
  useEffect(() => {
    const controller = new AbortController();

    async function bootstrap() {
      if (!tokenStore.read()) {
        setStatus('anonymous');
        return;
      }

      try {
        const { admin: account } = await fetchCurrentAdmin(controller.signal);
        setAdmin(account);
        setStatus('authenticated');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        tokenStore.clear();
        setAdmin(null);
        setStatus('anonymous');
      }
    }

    void bootstrap();
    return () => controller.abort();
  }, []);

  // The API client raises this when a session cannot be refreshed.
  useEffect(() => {
    function handleExpiry() {
      setAdmin(null);
      setStatus('anonymous');
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    tokenStore.write(result.tokens);
    setAdmin(result.admin);
    setStatus('authenticated');
  }, []);

  const refreshProfile = useCallback(async () => {
    const { admin: account } = await fetchCurrentAdmin();
    setAdmin(account);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // An already-invalid session is still a successful sign-out from here.
      if (!(error instanceof ApiError)) throw error;
    } finally {
      tokenStore.clear();
      setAdmin(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const granted = new Set(admin?.permissions ?? []);
    return {
      status,
      admin,
      can: (...permissions: string[]) => permissions.every((permission) => granted.has(permission)),
      canAny: (...permissions: string[]) => permissions.some((permission) => granted.has(permission)),
      signIn,
      signOut,
      refreshProfile,
    };
  }, [admin, status, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
