import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError, tokenStore } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { AuthProvider } from '../src/auth/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import { LoginPage } from '../src/pages/LoginPage';

jest.mock('../src/api/endpoints');

const mockedEndpoints = endpoints as jest.Mocked<typeof endpoints>;

function renderLogin() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <LoginPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  afterEach(() => tokenStore.clear());

  it('validates both fields before calling the API', async () => {
    const user = userEvent.setup();
    renderLogin();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(mockedEndpoints.login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    const user = userEvent.setup();
    renderLogin();

    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'TestAdminPass#123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(mockedEndpoints.login).not.toHaveBeenCalled();
  });

  it('signs in and stores the session', async () => {
    const user = userEvent.setup();
    mockedEndpoints.login.mockResolvedValue({
      admin: {
        id: 'admin-1',
        name: 'Super Admin',
        email: 'admin@sellersdash.local',
        status: 'active',
        mustChangePassword: false,
        passwordChangedAt: null,
        lastLoginAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: { id: 'role-1', slug: 'super_admin', name: 'Super administrator', description: 'Everything.' },
        permissions: ['merchant.view'],
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresIn: 900,
        refreshTokenExpiresIn: 2592000,
        tokenType: 'Bearer',
      },
    });

    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email address'), 'admin@sellersdash.local');
    await user.type(screen.getByLabelText('Password'), 'TestAdminPass#123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(tokenStore.read()?.accessToken).toBe('access-token'));
    expect(mockedEndpoints.login).toHaveBeenCalledWith('admin@sellersdash.local', 'TestAdminPass#123');
  });

  it('shows the server message and clears the password after a rejected sign-in', async () => {
    const user = userEvent.setup();
    mockedEndpoints.login.mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'Those sign-in details are not correct.'),
    );

    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email address'), 'admin@sellersdash.local');
    await user.type(screen.getByLabelText('Password'), 'WrongPassword#1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText('Those sign-in details are not correct.')).toBeInTheDocument(),
    );

    // The email is kept so a retry is quick; the password is not.
    expect(screen.getByLabelText('Email address')).toHaveValue('admin@sellersdash.local');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(tokenStore.read()).toBeNull();
  });

  it('explains a rate-limited sign-in in plain language', async () => {
    const user = userEvent.setup();
    mockedEndpoints.login.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a few minutes.'),
    );

    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Email address'), 'admin@sellersdash.local');
    await user.type(screen.getByLabelText('Password'), 'TestAdminPass#123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Too many sign-in attempts/));
  });
});
