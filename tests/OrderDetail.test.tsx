import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import { tokenStore } from '../src/api/client';
import type { AdminAccount, Order, OrderStatus, PaymentEntry } from '../src/api/types';
import { AuthProvider } from '../src/auth/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import { OrderDetailPanel } from '../src/pages/OrderDetail';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

const BASE: Order = {
  id: 'order-1',
  reference: 'ORD-0007',
  customerId: 'customer-1',
  customerName: 'Kavita Joshi',
  lines: [
    {
      lineType: 'item',
      subjectId: 'item-1',
      name: 'Masala Chai Packet',
      unit: 'piece',
      billingUnit: null,
      quantity: 4,
      unitRateMinor: 4_500,
      durationMinutes: null,
      lineTotalMinor: 18_000,
    },
    {
      lineType: 'service',
      subjectId: 'service-1',
      name: 'Home Delivery',
      unit: null,
      billingUnit: 'one_time',
      quantity: 1,
      unitRateMinor: 5_000,
      durationMinutes: null,
      lineTotalMinor: 5_000,
    },
  ],
  subtotalMinor: 23_000,
  discountType: 'percent',
  discountPercent: 10,
  discountMinor: 2_300,
  taxPercent: 18,
  taxMinor: 3_726,
  totalMinor: 24_426,
  paidMinor: 10_000,
  outstandingMinor: 14_426,
  status: 'confirmed',
  stockCommitted: true,
  stockCommittedAt: '2026-09-01T00:00:00.000Z',
  orderDate: '2026-09-01T00:00:00.000Z',
  dueDate: '2026-09-15T00:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  cancelledReason: null,
  returnedAt: null,
  returnedReason: null,
  notes: 'Deliver after 6pm.',
  paymentStatus: 'partially_paid',
  paymentState: 'overdue',
  installments: [],
  nextDueInstallment: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  merchantId: 'merchant-1',
  merchantName: 'Anita Desai',
};

const PAYMENT: PaymentEntry = {
  id: 'payment-1',
  payableType: 'order',
  payableId: BASE.id,
  payableReference: BASE.reference,
  direction: 'in',
  amountMinor: 10_000,
  method: 'upi',
  reference: 'UPI-8891',
  paidAt: '2026-09-05T00:00:00.000Z',
  notes: 'Paid on delivery',
  installmentNumber: null,
  balanceAfterMinor: 14_426,
  actorType: 'admin',
  actorLabel: 'Super Admin',
  createdAt: '2026-09-05T00:00:00.000Z',
};

const ALL_PERMISSIONS = [
  'order.view',
  'order.edit',
  'order.cancel',
  'payment.view',
  'payment.manage',
  'installment.view',
  'installment.manage',
];

function adminWith(permissions: string[]): AdminAccount {
  return {
    id: 'admin-1',
    name: 'Super Admin',
    email: 'admin@sellersdash.local',
    status: 'active',
    mustChangePassword: false,
    passwordChangedAt: null,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: {
      id: 'role-1',
      slug: 'super_admin',
      name: 'Super administrator',
      description: 'All of it.',
    },
    permissions,
  };
}

function renderPanel(
  order: Order = BASE,
  options: {
    payments?: PaymentEntry[];
    allowedTransitions?: OrderStatus[];
    permissions?: string[];
  } = {},
) {
  mocked.fetchAdminOrder.mockResolvedValue({
    order,
    payments: options.payments ?? [PAYMENT],
    allowedTransitions: options.allowedTransitions ?? ['in_progress', 'ready', 'completed', 'cancelled'],
  });
  mocked.fetchCurrentAdmin.mockResolvedValue({
    admin: adminWith(options.permissions ?? ALL_PERMISSIONS),
  });

  const onChanged = jest.fn();

  render(
    // The panel links a named customer back to the customers list, so it needs a router.
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <OrderDetailPanel orderId={order.id} onClose={jest.fn()} onChanged={onChanged} />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

  return { onChanged };
}

describe('OrderDetailPanel', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // A stored session, so AuthProvider restores an admin rather than staying anonymous.
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

  it('shows the lines with the names recorded at the time of sale', async () => {
    renderPanel();

    expect(await screen.findByText('Masala Chai Packet')).toBeInTheDocument();
    expect(screen.getByText('Home Delivery')).toBeInTheDocument();
    expect(screen.getAllByText('Product').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Service').length).toBeGreaterThan(0);
  });

  it('states the discount and tax rather than leaving them to be worked out', async () => {
    renderPanel();
    await screen.findByText('Masala Chai Packet');

    const [lineTable] = screen.getAllByRole('table');
    expect(within(lineTable!).getByText('Discount (10%)')).toBeInTheDocument();
    expect(within(lineTable!).getByText('Tax (18%)')).toBeInTheDocument();
    expect(within(lineTable!).getByText('−₹23.00')).toBeInTheDocument();
    expect(within(lineTable!).getByText('₹37.26')).toBeInTheDocument();
  });

  it('labels an overdue order as overdue, not merely part paid', async () => {
    renderPanel();
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
  });

  it('names an anonymous sale rather than leaving the cell empty', async () => {
    renderPanel({ ...BASE, customerId: null, customerName: null });
    expect(await screen.findByText('Walk-in sale')).toBeInTheDocument();
  });

  it('lists each payment with its method, reference and remaining balance', async () => {
    renderPanel();
    await screen.findByText('Masala Chai Packet');

    expect(screen.getByText('UPI')).toBeInTheDocument();
    expect(screen.getByText('UPI-8891')).toBeInTheDocument();
    expect(screen.getByText('Paid on delivery')).toBeInTheDocument();
    // A merchant should be able to see that support recorded it.
    expect(screen.getByText('Recorded by Super Admin')).toBeInTheDocument();
  });

  it('says which instalment a payment settled', async () => {
    renderPanel(BASE, { payments: [{ ...PAYMENT, installmentNumber: 2 }] });
    expect(await screen.findByText('Instalment #2')).toBeInTheDocument();
  });

  it('says plainly when nothing has been paid', async () => {
    renderPanel({ ...BASE, paidMinor: 0, outstandingMinor: BASE.totalMinor }, { payments: [] });
    expect(
      await screen.findByText('Nothing has been paid against this order yet.'),
    ).toBeInTheDocument();
  });

  it('explains that a draft has committed nothing', async () => {
    renderPanel({ ...BASE, status: 'draft', stockCommitted: false, stockCommittedAt: null });
    expect(await screen.findByText(/Nothing has been committed/)).toBeInTheDocument();
  });

  it('only offers the transitions the server says are allowed', async () => {
    renderPanel(BASE, { allowedTransitions: ['completed', 'cancelled'] });
    await screen.findByText('Masala Chai Packet');

    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark ready' })).not.toBeInTheDocument();
    // Cancelling has its own, destructive control rather than a "mark cancelled" button.
    expect(screen.queryByRole('button', { name: 'Mark cancelled' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
  });

  it('offers nothing to move a closed order on', async () => {
    renderPanel(
      { ...BASE, status: 'cancelled', cancelledAt: '2026-09-10T00:00:00.000Z', stockCommitted: false },
      { allowedTransitions: [] },
    );
    await screen.findByText('Masala Chai Packet');

    expect(screen.queryByText('Move this order on')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  it('moves the order on after the administrator confirms', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderPanel();
    await screen.findByText('Masala Chai Packet');

    mocked.transitionAdminOrder.mockResolvedValue({
      order: { ...BASE, status: 'completed', completedAt: '2026-09-10T00:00:00.000Z' },
      allowedTransitions: ['returned'],
    });

    await user.click(screen.getByRole('button', { name: 'Mark completed' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark completed' }));

    await waitFor(() => expect(mocked.transitionAdminOrder).toHaveBeenCalledWith('order-1', 'completed'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('surfaces the server refusal when a transition is not allowed', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Masala Chai Packet');

    mocked.transitionAdminOrder.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'An order that is cancelled cannot become completed.'),
    );

    await user.click(screen.getByRole('button', { name: 'Mark completed' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark completed' }));

    expect(
      await screen.findByText('An order that is cancelled cannot become completed.'),
    ).toBeInTheDocument();
  });

  it('warns that cancelling puts the stock back', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Masala Chai Packet');

    await user.click(screen.getByRole('button', { name: 'Cancel order' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/stock it was holding put back/)).toBeInTheDocument();
  });

  it('shows the instalment plan, marking what is late and what is next', async () => {
    renderPanel({
      ...BASE,
      installments: [
        {
          number: 1,
          amountMinor: 10_000,
          paidMinor: 10_000,
          outstandingMinor: 0,
          dueDate: '2026-08-15T00:00:00.000Z',
          status: 'paid',
          isOverdue: false,
          isNextDue: false,
          notes: null,
          reminderSentAt: null,
        },
        {
          number: 2,
          amountMinor: 14_426,
          paidMinor: 0,
          outstandingMinor: 14_426,
          dueDate: '2026-09-15T00:00:00.000Z',
          status: 'pending',
          isOverdue: true,
          isNextDue: true,
          notes: null,
          reminderSentAt: null,
        },
      ],
    });

    await screen.findByText('Instalment plan');
    const planTable = screen.getByRole('table', { name: 'Instalments on this order' });

    expect(within(planTable).getByText('Paid')).toBeInTheDocument();
    // A late instalment reads as overdue whatever its stored status says.
    expect(within(planTable).getByText('Overdue')).toBeInTheDocument();
    expect(within(planTable).getByText('Next due')).toBeInTheDocument();
  });

  it('hides the finance controls from an administrator who cannot use them', async () => {
    renderPanel(BASE, { permissions: ['order.view'] });
    await screen.findByText('Masala Chai Packet');

    expect(screen.queryByRole('button', { name: 'Record a payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set a plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
    expect(screen.queryByText('Move this order on')).not.toBeInTheDocument();
  });

  it('offers no payment button once the order is settled', async () => {
    renderPanel({
      ...BASE,
      paidMinor: BASE.totalMinor,
      outstandingMinor: 0,
      paymentStatus: 'fully_paid',
      paymentState: 'fully_paid',
    });
    await screen.findByText('Masala Chai Packet');

    expect(screen.queryByRole('button', { name: 'Record a payment' })).not.toBeInTheDocument();
  });

  it('surfaces a load failure with a way to retry', async () => {
    mocked.fetchCurrentAdmin.mockResolvedValue({ admin: adminWith(ALL_PERMISSIONS) });
    mocked.fetchAdminOrder.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'That order was not found.'));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ToastProvider>
            <OrderDetailPanel orderId="order-1" onClose={jest.fn()} onChanged={jest.fn()} />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('That order was not found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
