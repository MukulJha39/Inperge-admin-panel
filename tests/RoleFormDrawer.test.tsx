import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { PermissionGroup, RoleWithPermissions } from '../src/api/types';
import { ToastProvider } from '../src/components/Toast';
import { RoleFormDrawer } from '../src/pages/RoleFormDrawer';

jest.mock('../src/api/endpoints', () => ({
  createRole: jest.fn(),
  updateRole: jest.fn(),
}));

import { createRole, updateRole } from '../src/api/endpoints';

const GROUPS: PermissionGroup[] = [
  { group: 'Merchants', permissions: ['merchant.view', 'merchant.create', 'merchant.edit'] },
  { group: 'Orders', permissions: ['order.view', 'order.cancel'] },
];

const EXISTING: RoleWithPermissions = {
  id: 'role-1',
  slug: 'regional_support',
  name: 'Regional support',
  description: 'Handles merchant queries.',
  permissions: ['merchant.view', 'order.view'],
  isSystem: false,
  memberCount: 0,
  editable: true,
  deletable: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDrawer(role: RoleWithPermissions | null, onSaved = jest.fn()) {
  return {
    onSaved,
    ...render(
      <MemoryRouter>
        <ToastProvider>
          <RoleFormDrawer
            role={role}
            open
            groups={GROUPS}
            onClose={jest.fn()}
            onSaved={onSaved}
          />
        </ToastProvider>
      </MemoryRouter>,
    ),
  };
}

describe('RoleFormDrawer', () => {
  it('opens empty for a new role and lists every permission in the catalogue', () => {
    renderDrawer(null);

    expect(screen.getByRole('heading', { name: 'New role' })).toBeInTheDocument();
    expect(screen.getByLabelText('Role name')).toHaveValue('');
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText('0 of 5 chosen')).toBeInTheDocument();
  });

  it('pre-fills from the role being edited, ticking what it already holds', () => {
    renderDrawer(EXISTING);

    expect(screen.getByLabelText('Role name')).toHaveValue('Regional support');
    expect(screen.getByLabelText('What is this role for?')).toHaveValue('Handles merchant queries.');
    expect(screen.getByText('2 of 5 chosen')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /View merchants/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Create merchants/ })).not.toBeChecked();
  });

  it('takes or drops a whole group at once', async () => {
    const user = userEvent.setup();
    renderDrawer(null);

    const merchants = screen.getByRole('group', { name: 'Merchants' });
    await user.click(within(merchants).getByRole('button', { name: 'Select all' }));

    expect(screen.getByText('3 of 5 chosen')).toBeInTheDocument();
    expect(within(merchants).getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);

    await user.click(within(merchants).getByRole('button', { name: 'Clear group' }));
    expect(screen.getByText('0 of 5 chosen')).toBeInTheDocument();
  });

  it('sends only the ticked permissions when creating', async () => {
    const user = userEvent.setup();
    (createRole as jest.Mock).mockResolvedValue({ role: { ...EXISTING, permissions: ['order.view'] } });

    const { onSaved } = renderDrawer(null);

    await user.type(screen.getByLabelText('Role name'), 'Order desk');
    await user.type(screen.getByLabelText('What is this role for?'), 'Watches the order queue.');
    await user.click(screen.getByRole('checkbox', { name: /View orders/ }));
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(createRole).toHaveBeenCalledWith({
      name: 'Order desk',
      description: 'Watches the order queue.',
      permissions: ['order.view'],
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('updates an existing role by id', async () => {
    const user = userEvent.setup();
    (updateRole as jest.Mock).mockResolvedValue({ role: EXISTING });

    renderDrawer(EXISTING);

    await user.click(screen.getByRole('checkbox', { name: /Cancel orders/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateRole).toHaveBeenCalledWith('role-1', {
      name: 'Regional support',
      description: 'Handles merchant queries.',
      permissions: ['merchant.view', 'order.view', 'order.cancel'],
    }));
  });

  it('shows a field error the API returned against the right field', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('../src/api/client');
    (createRole as jest.Mock).mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
        details: [{ field: 'name', message: 'Another role already uses this name.' }],
      }),
    );

    renderDrawer(null);

    await user.type(screen.getByLabelText('Role name'), 'Read-only');
    await user.type(screen.getByLabelText('What is this role for?'), 'Duplicate name.');
    await user.click(screen.getByRole('checkbox', { name: /View orders/ }));
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    expect(await screen.findByText('Another role already uses this name.')).toBeInTheDocument();
  });

  describe('read-only', () => {
    /** The drawer as the roles list opens it for a role that cannot be changed. */
    function renderReadOnly() {
      return render(
        <MemoryRouter>
          <ToastProvider>
            <RoleFormDrawer
              role={EXISTING}
              open
              readOnly
              groups={GROUPS}
              onClose={jest.fn()}
              onSaved={jest.fn()}
            />
          </ToastProvider>
        </MemoryRouter>,
      );
    }

    it('shows what the role holds without offering to change any of it', () => {
      renderReadOnly();

      expect(screen.getByRole('heading', { name: 'Regional support' })).toBeInTheDocument();
      expect(screen.getByLabelText('Role name')).toBeDisabled();
      expect(screen.getByLabelText('What is this role for?')).toBeDisabled();
      expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).disabled)).toBe(true);
      // The permissions it holds are still ticked, which is the point of opening it.
      expect(screen.getByRole('checkbox', { name: /View merchants/ })).toBeChecked();
    });

    it('offers no way to save or to select a whole group', () => {
      renderReadOnly();

      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear group' })).not.toBeInTheDocument();
    });

    it('does not call the API even if a tick is forced through', async () => {
      const user = userEvent.setup();
      renderReadOnly();

      await user.click(screen.getByRole('checkbox', { name: /Create merchants/ })).catch(() => {});

      expect(screen.getByRole('checkbox', { name: /Create merchants/ })).not.toBeChecked();
      expect(updateRole).not.toHaveBeenCalled();
    });
  });
});
