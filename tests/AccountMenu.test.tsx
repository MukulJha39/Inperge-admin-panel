import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AdminAccount } from '../src/api/types';
import { AccountMenu } from '../src/components/AccountMenu';

const signOut = jest.fn();

let admin: AdminAccount | null = {
  id: 'admin-1',
  name: 'Priya Sharma',
  email: 'priya@sellersdash.local',
  status: 'active',
  mustChangePassword: false,
  passwordChangedAt: null,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: {
    id: 'role-1',
    slug: 'finance_admin',
    name: 'Finance / payment operations',
    description: 'Owns payments.',
  },
  permissions: ['payment.view'],
};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({
    admin,
    status: 'authenticated',
    can: () => true,
    canAny: () => true,
    signIn: jest.fn(),
    signOut,
    refreshProfile: jest.fn(),
  }),
}));

function renderMenu() {
  return render(
    <MemoryRouter>
      <AccountMenu />
    </MemoryRouter>,
  );
}

describe('AccountMenu', () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue(undefined);
  });

  it('shows who is signed in without opening anything', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { expanded: false });
    expect(trigger).toHaveTextContent('Priya Sharma');
    expect(trigger).toHaveTextContent('Finance / payment operations');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click and offers exactly the profile and sign-out actions', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'My profile',
      'Sign out',
    ]);
    // The email belongs in the menu, not in the bar behind it.
    expect(screen.getByText('priya@sellersdash.local')).toBeInTheDocument();
  });

  it('points My profile at the account screen', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('menuitem', { name: /My profile/ })).toHaveAttribute('href', '/account');
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { expanded: false });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { expanded: false })).toHaveFocus();
  });

  it('closes when a click lands outside it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountMenu />
        <button type="button">Somewhere else</button>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Somewhere else' }));

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('signs out, and says so while it is happening', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    signOut.mockReturnValue(new Promise<void>((resolve) => {
      release = resolve;
    }));

    renderMenu();
    await user.click(screen.getByRole('button', { expanded: false }));
    await user.click(screen.getByRole('menuitem', { name: /Sign out/ }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Signing out…')).toBeInTheDocument();

    // Let the sign-out settle inside act, so the state it sets afterwards is accounted for.
    await act(async () => {
      release();
    });
    expect(screen.queryByText('Signing out…')).not.toBeInTheDocument();
  });

  it('renders nothing when nobody is signed in', () => {
    const previous = admin;
    admin = null;
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
    admin = previous;
  });
});
