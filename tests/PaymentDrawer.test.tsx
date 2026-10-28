import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { PaymentEntry, Purchase } from '../src/api/types';
import { ToastProvider } from '../src/components/Toast';
import { PaymentDrawer } from '../src/pages/RelationshipDrawers';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

/** A purchase for ₹100.00 with ₹40.00 already paid. */
const PURCHASE: Purchase = {
  id: 'purchase-1',
  reference: 'PUR-0001',
  supplierId: 'supplier-1',
  supplierName: 'Deccan Wholesale',
  lines: [
    {
      subjectType: 'material',
      subjectId: 'material-1',
      name: 'Sugar',
      unit: 'kilogram',
      quantity: 10,
      unitCostMinor: 1_000,
      lineTotalMinor: 10_000,
    },
  ],
  subtotalMinor: 10_000,
  additionalCostMinor: 0,
  totalMinor: 10_000,
  paidMinor: 4_000,
  outstandingMinor: 6_000,
  purchaseDate: '2026-09-01T00:00:00.000Z',
  dueDate: null,
  notes: null,
  status: 'recorded',
  cancelledAt: null,
  cancelledReason: null,
  received: true,
  receivedAt: '2026-09-01T00:00:00.000Z',
  paymentStatus: 'partially_paid',
  paymentState: 'partially_paid',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function paymentResponse(amountMinor: number) {
  const payment: PaymentEntry = {
    id: 'payment-1',
    payableType: 'purchase',
    payableId: PURCHASE.id,
    payableReference: PURCHASE.reference,
    direction: 'out',
    amountMinor,
    method: 'cash',
    reference: null,
    paidAt: '2026-09-10T00:00:00.000Z',
    notes: null,
    installmentNumber: null,
  balanceAfterMinor: PURCHASE.outstandingMinor - amountMinor,
    actorType: 'admin',
    actorLabel: 'Super Admin',
    createdAt: '2026-09-10T00:00:00.000Z',
  };

  return {
    payment,
    purchase: {
      ...PURCHASE,
      paidMinor: PURCHASE.paidMinor + amountMinor,
      outstandingMinor: PURCHASE.outstandingMinor - amountMinor,
    },
  };
}

function renderDrawer(purchase: Purchase | null = PURCHASE) {
  const onClose = jest.fn();
  const onRecorded = jest.fn();

  // The drawer needs no auth context of its own: whether it can be opened at all is
  // decided by the page around it.
  render(
    <ToastProvider>
      <PaymentDrawer purchase={purchase} onClose={onClose} onRecorded={onRecorded} />
    </ToastProvider>,
  );

  return { onClose, onRecorded };
}

describe('PaymentDrawer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('shows what has been paid and what is outstanding', () => {
    renderDrawer();

    expect(screen.getByText(/of/)).toBeInTheDocument();
    expect(screen.getByText(/outstanding/)).toBeInTheDocument();
  });

  it('records a payment in whole minor units', async () => {
    mocked.recordAdminPurchasePayment.mockResolvedValue(paymentResponse(2_550));
    const { onRecorded, onClose } = renderDrawer();
    const user = userEvent.setup();

    // Typed in rupees; sent as paise.
    await user.type(screen.getByLabelText('Amount'), '25.50');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    await waitFor(() => expect(mocked.recordAdminPurchasePayment).toHaveBeenCalledTimes(1));
    expect(mocked.recordAdminPurchasePayment).toHaveBeenCalledWith('purchase-1', {
      amountMinor: 2_550,
      method: 'cash',
    });
    expect(onRecorded).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses more than the outstanding amount before calling the server', async () => {
    renderDrawer();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Amount'), '90');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    // Told before the round trip, and never sent.
    expect(await screen.findByText(/more than the/)).toBeInTheDocument();
    expect(mocked.recordAdminPurchasePayment).not.toHaveBeenCalled();
  });

  it('refuses a zero or empty amount', async () => {
    renderDrawer();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText('Enter an amount greater than zero.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '0');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(mocked.recordAdminPurchasePayment).not.toHaveBeenCalled();
  });

  it('previews what will remain, and says when a payment settles the purchase', async () => {
    renderDrawer();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Amount'), '20');
    expect(await screen.findByText(/will remain outstanding/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '60');
    expect(await screen.findByText('This settles the purchase in full.')).toBeInTheDocument();
  });

  it('sends the chosen method and reference', async () => {
    mocked.recordAdminPurchasePayment.mockResolvedValue(paymentResponse(1_000));
    renderDrawer();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Amount'), '10');
    await user.selectOptions(screen.getByLabelText('How was it paid?'), 'upi');
    await user.type(screen.getByLabelText(/Reference/), 'UPI-8842');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    await waitFor(() => expect(mocked.recordAdminPurchasePayment).toHaveBeenCalled());
    expect(mocked.recordAdminPurchasePayment).toHaveBeenCalledWith('purchase-1', {
      amountMinor: 1_000,
      method: 'upi',
      reference: 'UPI-8842',
    });
  });

  it('keeps everything typed when the server refuses', async () => {
    mocked.recordAdminPurchasePayment.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'That is more than the outstanding amount of INR 60.00.'),
    );
    const { onClose } = renderDrawer();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Amount'), '15');
    await user.type(screen.getByLabelText(/Notes/), 'Paid at the counter');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(
      await screen.findByText('That is more than the outstanding amount of INR 60.00.'),
    ).toBeInTheDocument();
    // The drawer stays open with the values intact.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Amount')).toHaveValue('15');
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Paid at the counter');
  });

  it('renders nothing when there is no purchase', () => {
    renderDrawer(null);
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
  });
});
