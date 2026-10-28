import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/components/Toast';
import { ChangePasswordForm } from '../src/pages/ChangePasswordPage';
import { MemberFormDrawer } from '../src/pages/TeamDrawers';
import type { RoleWithPermissions } from '../src/api/types';

jest.mock('../src/api/endpoints', () => ({
  changeOwnPassword: jest.fn(),
  createAdminMember: jest.fn(),
  updateAdminMember: jest.fn(),
  resetAdminMemberPassword: jest.fn(),
  updateAdminMemberStatus: jest.fn(),
}));

import { changeOwnPassword, createAdminMember } from '../src/api/endpoints';

function wrap(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );
}

describe('ChangePasswordForm', () => {
  it('will not submit when the confirmation does not match, and never calls the API', async () => {
    const user = userEvent.setup();
    wrap(<ChangePasswordForm onChanged={jest.fn()} />);

    await user.type(screen.getByLabelText('Current password'), 'OldPassword123!');
    await user.type(screen.getByLabelText('New password'), 'NewPassword456!');
    await user.type(screen.getByLabelText('Confirm new password'), 'Mistyped789!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('This does not match the new password.')).toBeInTheDocument();
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it('sends the current and new password once they match', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    (changeOwnPassword as jest.Mock).mockResolvedValue({ passwordChanged: true });

    wrap(<ChangePasswordForm onChanged={onChanged} />);

    await user.type(screen.getByLabelText('Current password'), 'OldPassword123!');
    await user.type(screen.getByLabelText('New password'), 'NewPassword456!');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPassword456!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(changeOwnPassword).toHaveBeenCalledWith('OldPassword123!', 'NewPassword456!'),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('names the field the API rejected', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('../src/api/client');
    (changeOwnPassword as jest.Mock).mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Your current password is not correct.', {
        details: [{ field: 'currentPassword', message: 'That is not your current password.' }],
      }),
    );

    wrap(<ChangePasswordForm onChanged={jest.fn()} />);

    await user.type(screen.getByLabelText('Current password'), 'WrongPassword1!');
    await user.type(screen.getByLabelText('New password'), 'NewPassword456!');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPassword456!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('That is not your current password.')).toBeInTheDocument();
  });

  it('relabels the current-password field when the change is being forced', () => {
    wrap(<ChangePasswordForm forced onChanged={jest.fn()} />);

    expect(screen.getByLabelText('The password you were given')).toBeInTheDocument();
    expect(
      screen.getByText(/Your password was set by another administrator/),
    ).toBeInTheDocument();
  });
});

const ROLES: RoleWithPermissions[] = [
  {
    id: 'role-1',
    slug: 'support_admin',
    name: 'Support',
    description: 'Helps merchants.',
    permissions: ['merchant.view'],
    isSystem: true,
    memberCount: 1,
    editable: true,
    deletable: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('MemberFormDrawer', () => {
  it('asks for a starting password when adding, and sends it with the role', async () => {
    const user = userEvent.setup();
    (createAdminMember as jest.Mock).mockResolvedValue({
      admin: { id: 'a1', name: 'Priya Sharma', role: { name: 'Support' } },
    });

    wrap(
      <MemberFormDrawer
        member={null}
        open
        roles={ROLES}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Full name'), 'Priya Sharma');
    await user.type(screen.getByLabelText('Email address'), 'priya@sellersdash.local');
    await user.type(screen.getByLabelText('Starting password'), 'StartingPass123!');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() =>
      expect(createAdminMember).toHaveBeenCalledWith({
        name: 'Priya Sharma',
        email: 'priya@sellersdash.local',
        roleId: 'role-1',
        password: 'StartingPass123!',
      }),
    );
  });

  it('never offers to set a password when editing an existing member', () => {
    wrap(
      <MemberFormDrawer
        member={{
          id: 'a1',
          name: 'Priya Sharma',
          email: 'priya@sellersdash.local',
          status: 'active',
          mustChangePassword: false,
          lastLoginAt: null,
          passwordChangedAt: null,
          role: { id: 'role-1', slug: 'support_admin', name: 'Support' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          canManage: true,
        }}
        open
        roles={ROLES}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Full name')).toHaveValue('Priya Sharma');
    expect(screen.queryByLabelText('Starting password')).not.toBeInTheDocument();
  });

  it('generates a password that satisfies the rule the API enforces', async () => {
    const user = userEvent.setup();
    wrap(
      <MemberFormDrawer
        member={null}
        open
        roles={ROLES}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    const field = screen.getByLabelText('Starting password') as HTMLInputElement;
    expect(field.value.length).toBeGreaterThanOrEqual(12);
    expect(field.value).toMatch(/[a-z]/);
    expect(field.value).toMatch(/[A-Z]/);
    expect(field.value).toMatch(/[0-9]/);
    // Generating reveals it, because a password nobody can read is of no use to pass on.
    expect(field.type).toBe('text');
  });
});
