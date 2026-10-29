import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { PayableSummary, PaymentEntry } from '../src/api/types';
import { ToastProvider } from '../src/components/Toast';
import { PaymentDeleteDialog, PaymentEditDrawer, PaymentTimeline } from '../src/pages/PaymentCorrection';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

const PAYMENT: PaymentEntry = {
  id: 'pay-1',
  payableType: 'order',
  payableId: 'order-1',
  payableReference: 'ORD-0007',
  direction: 'in',
  amountMinor: 400_000,
  method: 'upi',
  reference: 'UPI-1',
  paidAt: '2026-10-20T10:00:00.000Z',
  notes: null,
  installmentNumber: null,
  balanceAfterMinor: 100_000,
  actorType: 'merchant',
  actorLabel: 'Anita Desai',
  createdAt: '2026-10-20T10:00:00.000Z',
};

const PAYABLE: PayableSummary = {
  type: 'order',
  id: 'order-1',
  reference: 'ORD-0007',
  totalMinor: 500_000,
  paidMinor: 40_000,
  outstandingMinor: 460_000,
  paymentStatus: 'partially_paid',
};

function withToasts(node: React.ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

describe('PaymentEditDrawer', () => {
  it('sends only the new amount and the reason', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    mocked.correctAdminPayment.mockResolvedValue({ payment: { ...PAYMENT, amountMinor: 40_000 }, payable: PAYABLE });

    withToasts(<PaymentEditDrawer payment={PAYMENT} outstandingMinor={100_000} onClose={jest.fn()} onSaved={onSaved} />);

    const amount = screen.getByLabelText('Correct amount');
    expect(amount).toHaveValue('4000.00');
    await user.clear(amount);
    await user.type(amount, '400');
    await user.type(screen.getByLabelText(/Reason for the change/), 'Typed an extra zero');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    await waitFor(() =>
      expect(mocked.correctAdminPayment).toHaveBeenCalledWith('pay-1', {
        amountMinor: 40_000,
        reason: 'Typed an extra zero',
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('stops an amount above what the order allows before calling the server', async () => {
    const user = userEvent.setup();
    withToasts(<PaymentEditDrawer payment={PAYMENT} outstandingMinor={100_000} onClose={jest.fn()} onSaved={jest.fn()} />);

    const amount = screen.getByLabelText('Correct amount');
    await user.clear(amount);
    await user.type(amount, '6000');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByText(/can be at most ₹5,000.00/)).toBeInTheDocument();
    expect(mocked.correctAdminPayment).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    const user = userEvent.setup();
    mocked.correctAdminPayment.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'That would be more than the total of INR 5,000.00.'),
    );
    withToasts(<PaymentEditDrawer payment={PAYMENT} onClose={jest.fn()} onSaved={jest.fn()} />);

    const amount = screen.getByLabelText('Correct amount');
    await user.clear(amount);
    await user.type(amount, '4500');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByText(/more than the total/)).toBeInTheDocument();
  });
});

describe('PaymentDeleteDialog', () => {
  it('deletes with the reason and reports back', async () => {
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    mocked.deleteAdminPayment.mockResolvedValue({ deleted: true, payment: PAYMENT, payable: PAYABLE });

    withToasts(<PaymentDeleteDialog payment={PAYMENT} onClose={jest.fn()} onDeleted={onDeleted} />);

    await user.type(screen.getByLabelText(/Reason/), 'Recorded twice');
    await user.click(screen.getByRole('button', { name: 'Delete payment' }));

    await waitFor(() => expect(mocked.deleteAdminPayment).toHaveBeenCalledWith('pay-1', 'Recorded twice'));
    expect(onDeleted).toHaveBeenCalled();
  });
});

describe('PaymentTimeline', () => {
  it('offers correct and delete only to administrators who may manage payments', () => {
    const { rerender } = withToasts(
      <PaymentTimeline payments={[PAYMENT]} emptyText="None" canManage={false} outstandingMinor={0} onChanged={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Correct the/ })).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <PaymentTimeline payments={[PAYMENT]} emptyText="None" canManage outstandingMinor={0} onChanged={jest.fn()} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Correct the ₹4,000.00 payment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete the ₹4,000.00 payment' })).toBeInTheDocument();
  });

  it('opens the correction drawer from a row and refreshes after saving', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    mocked.correctAdminPayment.mockResolvedValue({ payment: PAYMENT, payable: PAYABLE });

    withToasts(
      <PaymentTimeline payments={[PAYMENT]} emptyText="None" canManage outstandingMinor={100_000} onChanged={onChanged} />,
    );

    await user.click(screen.getByRole('button', { name: 'Correct the ₹4,000.00 payment' }));
    const amount = await screen.findByLabelText('Correct amount');
    await user.clear(amount);
    await user.type(amount, '3000');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
