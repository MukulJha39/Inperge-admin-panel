import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Installment, Order, PaymentEntry } from '../src/api/types';
import { ToastProvider } from '../src/components/Toast';
import { DeliveryDrawer, InstallmentPlanDrawer, OrderPaymentDrawer } from '../src/pages/OrderDrawers';
import { formatDeliveryTime, hasDelivery } from '../src/utils/orderFormat';

jest.mock('../src/api/endpoints');

const mocked = endpoints as jest.Mocked<typeof endpoints>;

function installment(overrides: Partial<Installment> & { number: number }): Installment {
  return {
    amountMinor: 10_000,
    paidMinor: 0,
    outstandingMinor: 10_000,
    dueDate: '2026-10-15T00:00:00.000Z',
    status: 'pending',
    isOverdue: false,
    isNextDue: false,
    notes: null,
    reminderSentAt: null,
    ...overrides,
  };
}

/** An order for ₹300.00 with ₹100.00 already paid. */
const ORDER: Order = {
  id: 'order-1',
  reference: 'ORD-0007',
  customerId: 'customer-1',
  customerName: 'Kavita Joshi',
  lines: [
    {
      lineType: 'service',
      subjectId: 'service-1',
      name: 'Home Delivery',
      unit: null,
      billingUnit: 'one_time',
      quantity: 3,
      unitRateMinor: 10_000,
      durationMinutes: null,
      lineTotalMinor: 30_000,
    },
  ],
  subtotalMinor: 30_000,
  discountType: 'none',
  discountPercent: null,
  discountMinor: 0,
  taxPercent: null,
  taxMinor: 0,
  totalMinor: 30_000,
  paidMinor: 10_000,
  outstandingMinor: 20_000,
  status: 'confirmed',
  stockCommitted: true,
  stockCommittedAt: '2026-09-01T00:00:00.000Z',
  orderDate: '2026-09-01T00:00:00.000Z',
  dueDate: null,
  completedAt: null,
  cancelledAt: null,
  cancelledReason: null,
  returnedAt: null,
  returnedReason: null,
  notes: null,
  paymentStatus: 'partially_paid',
  paymentState: 'partially_paid',
  installments: [],
  nextDueInstallment: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const ENTRY: PaymentEntry = {
  id: 'payment-2',
  payableType: 'order',
  payableId: ORDER.id,
  payableReference: ORDER.reference,
  direction: 'in',
  amountMinor: 5_000,
  method: 'cash',
  reference: null,
  paidAt: '2026-10-05T00:00:00.000Z',
  notes: null,
  installmentNumber: null,
  balanceAfterMinor: 15_000,
  actorType: 'admin',
  actorLabel: 'Super Admin',
  createdAt: '2026-10-05T00:00:00.000Z',
};

describe('OrderPaymentDrawer', () => {
  beforeEach(() => jest.resetAllMocks());

  function renderDrawer(order: Order = ORDER) {
    const onRecorded = jest.fn();
    const onClose = jest.fn();

    render(
      <ToastProvider>
        <OrderPaymentDrawer order={order} onClose={onClose} onRecorded={onRecorded} />
      </ToastProvider>,
    );

    return { onRecorded, onClose };
  }

  it('states what is paid and what is left before anything is typed', () => {
    renderDrawer();
    expect(screen.getByText(/₹100.00 of ₹300.00 paid/)).toBeInTheDocument();
    expect(screen.getByText(/₹200.00 outstanding/)).toBeInTheDocument();
  });

  it('previews what will remain as the amount is typed', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText('Amount'), '50');
    expect(await screen.findByText('₹150.00 will remain outstanding.')).toBeInTheDocument();
  });

  it('says plainly when an amount settles the order in full', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText('Amount'), '200');
    expect(await screen.findByText('This settles the order in full.')).toBeInTheDocument();
  });

  it('refuses an overpayment before a round trip, naming the outstanding amount', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText(/That is more than the ₹200.00 outstanding./)).toBeInTheDocument();
    expect(mocked.recordAdminOrderPayment).not.toHaveBeenCalled();
  });

  it('refuses an amount of zero', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText('Amount'), '0');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(await screen.findByText('Enter an amount greater than zero.')).toBeInTheDocument();
    expect(mocked.recordAdminOrderPayment).not.toHaveBeenCalled();
  });

  it('records the payment and hands the updated order back', async () => {
    const user = userEvent.setup();
    const { onRecorded, onClose } = renderDrawer();

    mocked.recordAdminOrderPayment.mockResolvedValue({
      payment: ENTRY,
      order: { ...ORDER, paidMinor: 15_000, outstandingMinor: 15_000 },
    });

    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    await waitFor(() =>
      expect(mocked.recordAdminOrderPayment).toHaveBeenCalledWith('order-1', {
        amountMinor: 5_000,
        method: 'cash',
      }),
    );
    expect(onRecorded).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no instalment picker when the order has no plan', () => {
    renderDrawer();
    expect(screen.queryByLabelText('Towards which instalment?')).not.toBeInTheDocument();
  });

  it('opens on the instalment that is due, prefilled with what it owes', async () => {
    const next = installment({ number: 2, amountMinor: 10_000, outstandingMinor: 10_000, isNextDue: true });
    renderDrawer({
      ...ORDER,
      installments: [
        installment({ number: 1, paidMinor: 10_000, outstandingMinor: 0, status: 'paid' }),
        next,
        installment({ number: 3, dueDate: '2026-11-15T00:00:00.000Z' }),
      ],
      nextDueInstallment: next,
    });

    expect(await screen.findByDisplayValue('100.00')).toBeInTheDocument();
    const picker = screen.getByLabelText('Towards which instalment?') as HTMLSelectElement;
    expect(picker.value).toBe('2');
    // A paid instalment is not offered: there is nothing left to pay against it.
    expect(within_options(picker)).not.toContain('1');
  });

  it('sends the chosen instalment with the payment', async () => {
    const user = userEvent.setup();
    const next = installment({ number: 1, isNextDue: true });
    renderDrawer({ ...ORDER, installments: [next, installment({ number: 2 })], nextDueInstallment: next });

    mocked.recordAdminOrderPayment.mockResolvedValue({ payment: ENTRY, order: ORDER });

    await user.selectOptions(screen.getByLabelText('Towards which instalment?'), '2');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    await waitFor(() =>
      expect(mocked.recordAdminOrderPayment).toHaveBeenCalledWith('order-1', {
        amountMinor: 10_000,
        method: 'cash',
        installmentNumber: 2,
      }),
    );
  });

  it('warns when the amount exceeds what the chosen instalment owes', async () => {
    const user = userEvent.setup();
    const next = installment({ number: 1, isNextDue: true });
    renderDrawer({ ...ORDER, installments: [next, installment({ number: 2 })], nextDueInstallment: next });

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '150');

    expect(
      await screen.findByText(/only owes ₹100.00. The rest still counts towards the order/),
    ).toBeInTheDocument();
  });

  it('surfaces the server refusal rather than claiming success', async () => {
    const user = userEvent.setup();
    renderDrawer();

    mocked.recordAdminOrderPayment.mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'That is more than the outstanding amount of INR 200.00.'),
    );

    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));

    expect(
      await screen.findByText('That is more than the outstanding amount of INR 200.00.'),
    ).toBeInTheDocument();
  });
});

/** The values a select actually offers, so an excluded option can be asserted on. */
function within_options(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.value);
}

describe('InstallmentPlanDrawer', () => {
  beforeEach(() => jest.resetAllMocks());

  function renderDrawer(order: Order = ORDER) {
    const onSaved = jest.fn();
    const onClose = jest.fn();

    render(
      <ToastProvider>
        <InstallmentPlanDrawer order={order} onClose={onClose} onSaved={onSaved} />
      </ToastProvider>,
    );

    return { onSaved, onClose };
  }

  it('starts with two empty instalments and says the plan does not yet add up', () => {
    renderDrawer();

    expect(screen.getByLabelText('Amount for instalment 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount for instalment 2')).toBeInTheDocument();
    expect(screen.getByText('₹300.00 short')).toBeInTheDocument();
  });

  it('splits the total the way the server would, remainder on the first', async () => {
    const user = userEvent.setup();
    // ₹100.00 over three does not divide evenly.
    renderDrawer({ ...ORDER, totalMinor: 10_000, paidMinor: 0, outstandingMinor: 10_000 });

    await user.click(screen.getByRole('button', { name: 'Add an instalment' }));
    await user.click(screen.getByRole('button', { name: 'Split evenly' }));

    expect((screen.getByLabelText('Amount for instalment 1') as HTMLInputElement).value).toBe('33.34');
    expect((screen.getByLabelText('Amount for instalment 2') as HTMLInputElement).value).toBe('33.33');
    expect((screen.getByLabelText('Amount for instalment 3') as HTMLInputElement).value).toBe('33.33');
    expect(screen.getByText('Adds up')).toBeInTheDocument();
  });

  it('refuses to send a plan that does not add up, and says by how much', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText('Amount for instalment 1'), '100');
    await user.type(screen.getByLabelText('Amount for instalment 2'), '100');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(
      await screen.findByText('The instalments are ₹100.00 short of the order total.'),
    ).toBeInTheDocument();
    expect(mocked.setAdminInstallmentPlan).not.toHaveBeenCalled();
  });

  it('refuses a plan that overshoots the order total', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText('Amount for instalment 1'), '200');
    await user.type(screen.getByLabelText('Amount for instalment 2'), '200');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(
      await screen.findByText('The instalments are ₹100.00 more than the order total.'),
    ).toBeInTheDocument();
  });

  it('sends a plan that adds up', async () => {
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDrawer();

    mocked.setAdminInstallmentPlan.mockResolvedValue({ order: ORDER });

    await user.click(screen.getByRole('button', { name: 'Split evenly' }));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));

    await waitFor(() => expect(mocked.setAdminInstallmentPlan).toHaveBeenCalled());
    const [, installments] = mocked.setAdminInstallmentPlan.mock.calls[0]!;
    expect(installments.map((entry) => entry.amountMinor)).toEqual([15_000, 15_000]);
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('warns that a deposit already taken will be spread across the plan', () => {
    renderDrawer();
    expect(
      screen.getByText(/₹100.00 has already been paid. It will be spread across the plan/),
    ).toBeInTheDocument();
  });

  it('opens an existing plan as it stands rather than blank', () => {
    renderDrawer({
      ...ORDER,
      paidMinor: 0,
      outstandingMinor: 30_000,
      installments: [
        installment({ number: 1, amountMinor: 20_000, outstandingMinor: 20_000, notes: 'Deposit' }),
        installment({ number: 2, amountMinor: 10_000, dueDate: '2026-11-15T00:00:00.000Z' }),
      ],
    });

    expect((screen.getByLabelText('Amount for instalment 1') as HTMLInputElement).value).toBe('200.00');
    // An optional field's label carries the word "Optional" alongside it.
    expect((screen.getByLabelText(/Note for instalment 1/) as HTMLInputElement).value).toBe('Deposit');
    expect(screen.getByText('Adds up')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit instalment plan' })).toBeInTheDocument();
  });

  it('removes an instalment and re-reports the shortfall', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Split evenly' }));
    expect(screen.getByText('Adds up')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove instalment 2' }));
    expect(await screen.findByText('₹150.00 short')).toBeInTheDocument();
  });

  it('surfaces the server refusal when a plan cannot be replaced', async () => {
    const user = userEvent.setup();
    renderDrawer();

    mocked.setAdminInstallmentPlan.mockRejectedValue(
      new ApiError(
        409,
        'CONFLICT',
        'Payments have already been recorded against this plan, so it cannot be replaced.',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Split evenly' }));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(
      await screen.findByText(
        'Payments have already been recorded against this plan, so it cannot be replaced.',
      ),
    ).toBeInTheDocument();
  });
});

describe('DeliveryDrawer', () => {
  const WITH_DELIVERY: Order = {
    ...ORDER,
    deliveryDate: '2026-11-05',
    deliveryTime: '14:30',
    deliveryLocation: '12 MG Road, Bengaluru',
  };

  it('prefills the three fields and sends only what changed', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    mocked.updateAdminOrderDelivery.mockResolvedValue({ order: { ...WITH_DELIVERY, deliveryTime: '18:00' } });

    render(
      <ToastProvider>
        <DeliveryDrawer order={WITH_DELIVERY} onClose={jest.fn()} onSaved={onSaved} />
      </ToastProvider>,
    );

    expect(screen.getByLabelText(/Delivery date/)).toHaveValue('2026-11-05');
    expect(screen.getByLabelText(/Delivery location/)).toHaveValue('12 MG Road, Bengaluru');

    const time = screen.getByLabelText(/Delivery time/);
    await user.clear(time);
    await user.type(time, '18:00');
    await user.click(screen.getByRole('button', { name: 'Save delivery details' }));

    await waitFor(() =>
      expect(mocked.updateAdminOrderDelivery).toHaveBeenCalledWith(ORDER.id, { deliveryTime: '18:00' }),
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ deliveryTime: '18:00' }));
  });

  it('clears a field by sending null', async () => {
    const user = userEvent.setup();
    mocked.updateAdminOrderDelivery.mockResolvedValue({ order: { ...WITH_DELIVERY, deliveryLocation: null } });

    render(
      <ToastProvider>
        <DeliveryDrawer order={WITH_DELIVERY} onClose={jest.fn()} onSaved={jest.fn()} />
      </ToastProvider>,
    );

    await user.clear(screen.getByLabelText(/Delivery location/));
    await user.click(screen.getByRole('button', { name: 'Save delivery details' }));

    await waitFor(() =>
      expect(mocked.updateAdminOrderDelivery).toHaveBeenCalledWith(ORDER.id, { deliveryLocation: null }),
    );
  });

  it('shows the server refusing a field', async () => {
    const user = userEvent.setup();
    mocked.updateAdminOrderDelivery.mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
        details: [{ field: 'deliveryTime', message: 'Enter the delivery time as HH:mm, for example 14:30.' }],
      }),
    );

    render(
      <ToastProvider>
        <DeliveryDrawer order={ORDER} onClose={jest.fn()} onSaved={jest.fn()} />
      </ToastProvider>,
    );

    await user.type(screen.getByLabelText(/Delivery location/), 'Gate 2');
    await user.click(screen.getByRole('button', { name: 'Save delivery details' }));

    expect(await screen.findByText(/Enter the delivery time as HH:mm/)).toBeInTheDocument();
  });
});

describe('delivery formatting', () => {
  it('reads a 24-hour time the way the panel shows times', () => {
    expect(formatDeliveryTime('00:05')).toBe('12:05 AM');
    expect(formatDeliveryTime('09:00')).toBe('9:00 AM');
    expect(formatDeliveryTime('12:00')).toBe('12:00 PM');
    expect(formatDeliveryTime('18:30')).toBe('6:30 PM');
    expect(formatDeliveryTime(null)).toBe('—');
  });

  it('knows whether any delivery detail is set', () => {
    expect(hasDelivery({})).toBe(false);
    expect(hasDelivery({ deliveryDate: null, deliveryTime: null, deliveryLocation: null })).toBe(false);
    expect(hasDelivery({ deliveryLocation: 'Gate 2' })).toBe(true);
  });
});
