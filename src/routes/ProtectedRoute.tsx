import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FullPageLoader } from '../components/States';
import { ForbiddenPage } from '../pages/FallbackPages';

/** Requires a signed-in admin, remembering where they were headed. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Checking your session" />;

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/**
 * Requires specific permissions for a route.
 *
 * The API enforces the same permissions, so this only saves the admin from opening a
 * page that would fail (PRD section 26).
 */
export function RequirePermission({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...permissions)) return <ForbiddenPage />;
  return <>{children}</>;
}
