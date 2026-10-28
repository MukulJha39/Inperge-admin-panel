import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { PaymentEntry, Purchase } from '../src/api/types';
import { tokenStore } from '../src/api/client';
import type { AdminAccount } from '../src/api/types';
import { AuthProvider } from '../src/auth/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import { PurchaseDetailPanel } from '../src/pages/PurchaseDetail';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

const BASE: Purchase = {
  id: 'purchase-1',
  reference: 'PUR-0007',
  supplierId: 'supplier-1',
  supplierName: 'Deccan Wholesale',
  lines: [
    {
      subjectType: 'material',
      subjectId: 'material-1',
      name: 'Wheat Flour',
      unit: 'kilogram',
      quantity: 25,
      unitCostMinor: 4_200,
      lineTotalMinor: 105_000,
    },
    {
      subjectType: 'item',
      subjectId: 'item-1',
      name: 'Masala Chai Packet',
      unit: 'piece',
      quantity: 48,
      unitCostMinor: 3_200,
      lineTotalMinor: 153_600,
    },
  ],
  subtotalMinor: 258_600,
  additionalCostMinor: 15_000,
  totalMinor: 273_600,
  paidMinor: 100_000,
  outstandingMinor: 173_600,
  purchaseDate: '2026-09-01T00:00:00.000Z',
  dueDate: '2026-09-15T00:00:00.000Z',
  notes: 'Delivered in two vans.',
  status: 'recorded',
  cancelledAt: null,
  cancelledReason: null,
  received: true,
  receivedAt: '2026-09-01T00:00:00.000Z',
  paymentStatus: 'partially_paid',
  paymentState: 'overdue',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  merchantId: 'merchant-1',
  merchantName: 'Anita Desai',
};

const PAYMENT: PaymentEntry = {
  id: 'payment-1',
  payableType: 'purchase',
  payableId: BASE.id,
  payableReference: BASE.reference,
  direction: 'out',
  amountMinor: 100_000,
  method: 'bank_transfer',
  reference: 'NEFT-5521',
  paidAt: '2026-09-05T00:00:00.000Z',
  notes: 'First instalment',
  installmentNumber: null,
  balanceAfterMinor: 173_600,
  actorType: 'admin',
  actorLabel: 'Super Admin',
  createdAt: '2026-09-05T00:00:00.000Z',
};

/** An administrator who can both cancel a purchase and record a payment. */
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
    role: { id: 'role-1', slug: 'super_admin', name: 'Super administrator', description: 'All of it.' },
    permissions,
  };
}

function renderPanel(purchase: Purchase = BASE, payments: PaymentEntry[] = [PAYMENT]) {
  mocked.fetchAdminPurchase.mockResolvedValue({ purchase, payments });
  mocked.fetchCurrentAdmin.mockResolvedValue({
    admin: adminWith(['purchase.view', 'purchase.manage', 'payment.view', 'payment.manage']),
  });
  const onChanged = jest.fn();

  render(
    <AuthProvider>
      <ToastProvider>
        <PurchaseDetailPanel purchaseId={purchase.id} onClose={jest.fn()} onChanged={onChanged} />
      </ToastProvider>
    </AuthProvider>,
  );

  return { onChanged };
}

describe('PurchaseDetailPanel', () => {
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

  it('shows the lines with the names recorded at the time', async () => {
    renderPanel();

    expect(await screen.findByText('Wheat Flour')).toBeInTheDocument();
    expect(screen.getByText('Masala Chai Packet')).toBeInTheDocument();
    expect(screen.getByText('25 kg')).toBeInTheDocument();
    expect(screen.getByText('48 pieces')).toBeInTheDocument();
  });

  it('shows the totals, including costs that are not a line', async () => {
    renderPanel();
    await screen.findByText('Wheat Flour');

    const table = screen.getByRole('table');
    expect(within(table).getByText('Other costs')).toBeInTheDocument();
    // Subtotal, other costs and total are all stated rather than left to be added up.
    expect(within(table).getAllByText('₹2,586.00').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('₹2,736.00').length).toBeGreaterThan(0);
  });

  it('labels an overdue purchase as overdue, not merely part paid', async () => {
    renderPanel();
    expect(await screen.findByText('Overdue')).toBeInTheDocument();
  });

  it('lists each payment with its method, reference and remaining balance', async () => {
    renderPanel();
    await screen.findByText('Wheat Flour');

    expect(screen.getByText('Bank transfer')).toBeInTheDocument();
    expect(screen.getByText('NEFT-5521')).toBeInTheDocument();
    expect(screen.getByText('First instalment')).toBeInTheDocument();
    expect(screen.getByText(/left after this/)).toBeInTheDocument();
    // A merchant should be able to see support recorded it.
    expect(screen.getByText('Recorded by Super Admin')).toBeInTheDocument();
  });

  it('says plainly when nothing has been paid', async () => {
    renderPanel({ ...BASE, paidMinor: 0, outstandingMinor: BASE.totalMinor }, []);
    expect(
      await screen.findByText('Nothing has been paid against this purchase yet.'),
    ).toBeInTheDocument();
  });

  it('explains that an unreceived purchase is not counted in stock', async () => {
    renderPanel({ ...BASE, received: false, receivedAt: null });
    expect(await screen.findByText(/has not been received yet/)).toBeInTheDocument();
  });

  it('shows a cancellation with its reason, and offers no further actions', async () => {
    renderPanel({
      ...BASE,
      status: 'cancelled',
      cancelledAt: '2026-09-20T00:00:00.000Z',
      cancelledReason: 'Duplicate entry',
      received: false,
      receivedAt: null,
    });

    expect(await screen.findByText(/Duplicate entry/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel purchase' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record a payment' })).not.toBeInTheDocument();
  });

  it('warns that cancelling puts the stock back, and only acts on confirmation', async () => {
    mocked.cancelAdminPurchase.mockResolvedValue({
      purchase: { ...BASE, status: 'cancelled', received: false },
    });
    const { onChanged } = renderPanel();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cancel purchase' }));
    expect(await screen.findByText(/put back/)).toBeInTheDocument();

    // Backing out does nothing.
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(mocked.cancelAdminPurchase).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel purchase' }));
    const dialog = await screen.findByRole('alertdialog', { name: /Cancel this purchase/ });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel purchase' }));

    await waitFor(() => expect(mocked.cancelAdminPurchase).toHaveBeenCalledWith('purchase-1'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('reports a refused cancellation without changing anything on screen', async () => {
    mocked.cancelAdminPurchase.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'There is not enough stock. Available: 2 piece.'),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cancel purchase' }));
    const dialog = await screen.findByRole('alertdialog', { name: /Cancel this purchase/ });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel purchase' }));

    expect(
      await screen.findByText('There is not enough stock. Available: 2 piece.'),
    ).toBeInTheDocument();
  });

  it('recovers from a failed load', async () => {
    mocked.fetchAdminPurchase.mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'),
    );
    mocked.fetchCurrentAdmin.mockResolvedValue({ admin: adminWith(['purchase.view']) });

    render(
      <AuthProvider>
        <ToastProvider>
          <PurchaseDetailPanel purchaseId="purchase-1" onClose={jest.fn()} onChanged={jest.fn()} />
        </ToastProvider>
      </AuthProvider>,
    );

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
