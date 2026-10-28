import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

interface PermissionGateProps {
  /** Every listed permission is required. */
  require: string[];
  /** Shown when the signed-in admin does not hold them. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Hides a control the current role cannot use.
 *
 * This is purely about not showing dead ends — the API enforces the same permission
 * on every request, so removing this component would not grant anyone access
 * (PRD section 26).
 */
export function PermissionGate({ require, fallback = null, children }: PermissionGateProps) {
  const { can } = useAuth();
  if (!can(...require)) return <>{fallback}</>;
  return <>{children}</>;
}
