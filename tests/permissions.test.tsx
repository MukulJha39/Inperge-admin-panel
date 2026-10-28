import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext';
import { PERMISSIONS, describePermission } from '../src/auth/permissions';
import { PermissionGate } from '../src/components/PermissionGate';
import { tokenStore } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { AdminAccount } from '../src/api/types';

jest.mock('../src/api/endpoints');

const mockedEndpoints = endpoints as jest.Mocked<typeof endpoints>;

function adminWith(permissions: string[], slug = 'readonly_admin'): AdminAccount {
  return {
    id: 'admin-1',
    name: 'Read-only Admin',
    email: 'readonly@sellersdash.local',
    status: 'active',
    mustChangePassword: false,
    passwordChangedAt: null,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: { id: 'role-1', slug, name: 'Read-only', description: 'Can inspect but not change.' },
    permissions,
  };
}

function renderWithAuth(ui: React.ReactNode) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}

describe('PermissionGate', () => {
  beforeEach(() => {
    tokenStore.write({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 2592000,
      tokenType: 'Bearer',
    });
  });

  afterEach(() => {
    tokenStore.clear();
  });

  it('shows a control the role is allowed to use', async () => {
    mockedEndpoints.fetchCurrentAdmin.mockResolvedValue({
      admin: adminWith([PERMISSIONS.MERCHANT_VIEW, PERMISSIONS.MERCHANT_EDIT]),
    });

    renderWithAuth(
      <PermissionGate require={[PERMISSIONS.MERCHANT_EDIT]}>
        <button type="button">Edit merchant</button>
      </PermissionGate>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit merchant' })).toBeInTheDocument());
  });

  it('hides a control the role cannot use', async () => {
    mockedEndpoints.fetchCurrentAdmin.mockResolvedValue({
      admin: adminWith([PERMISSIONS.MERCHANT_VIEW]),
    });

    renderWithAuth(
      <>
        <span>loaded</span>
        <PermissionGate require={[PERMISSIONS.MERCHANT_SUSPEND]}>
          <button type="button">Suspend merchant</button>
        </PermissionGate>
      </>,
    );

    await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Suspend merchant' })).not.toBeInTheDocument();
  });

  it('requires every listed permission, not just one', async () => {
    mockedEndpoints.fetchCurrentAdmin.mockResolvedValue({
      admin: adminWith([PERMISSIONS.MERCHANT_VIEW]),
    });

    renderWithAuth(
      <PermissionGate
        require={[PERMISSIONS.MERCHANT_VIEW, PERMISSIONS.MERCHANT_EDIT]}
        fallback={<span>not allowed</span>}
      >
        <button type="button">Edit merchant</button>
      </PermissionGate>,
    );

    await waitFor(() => expect(screen.getByText('not allowed')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Edit merchant' })).not.toBeInTheDocument();
  });
});

describe('describePermission', () => {
  it('turns permission strings into readable labels using merchant terminology', () => {
    expect(describePermission('merchant.view')).toBe('View merchants');
    expect(describePermission('merchant.suspend')).toBe('Suspend merchants');
    expect(describePermission('payment.manage')).toBe('Manage payments');
    expect(describePermission('audit.view')).toBe('View audit history');
  });

  it('never calls a merchant a user', () => {
    const labels = ['merchant.view', 'merchant.create', 'merchant.edit', 'merchant.suspend'].map(
      describePermission,
    );
    expect(labels.join(' ')).not.toMatch(/user/i);
  });

  it('falls back to the raw string for an unknown shape', () => {
    expect(describePermission('weird')).toBe('weird');
  });
});
