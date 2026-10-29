import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { recordAdminOrderPayment, setAdminInstallmentPlan, updateAdminOrderDelivery } from '../api/endpoints';
import type {
  Installment,
  InstallmentInput,
  Order,
  OrderDeliveryInput,
  PaymentEntry,
  PaymentMethod,
} from '../api/types';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { formatDate, formatMoneyMinor } from '../utils/format';
import { installmentStatusLabel } from '../utils/orderFormat';
import {
  minorToAmountInput,
  parseAmountToMinor,
  PAYMENT_METHOD_OPTIONS,
} from '../utils/paymentFormat';

/** Maps the server's field errors onto the inputs they belong to. */
function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return error.fieldErrors();
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Today in the `yyyy-mm-dd` form a date input expects. */
function todayInput(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/* ------------------------------ order payment ----------------------------- */

interface OrderPaymentDrawerProps {
  order: Order | null;
  onClose: () => void;
  onRecorded: (result: { payment: PaymentEntry; order: Order }) => void;
}

/**
 * Records a payment against an order, optionally against one instalment of its plan.
 *
 * The amount is checked here only so the administrator is told before a round trip; the
 * server refuses an overpayment regardless, which is the check that matters.
 */
export function OrderPaymentDrawer({ order, onClose, onRecorded }: OrderPaymentDrawerProps) {
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [installmentNumber, setInstallmentNumber] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unpaidInstallments = useMemo(
    () => (order?.installments ?? []).filter((entry) => entry.status !== 'paid'),
    [order],
  );

  useEffect(() => {
    if (!order) return;
    setMethod('cash');
    setReference('');
    setNotes('');
    setFieldErrors({});
    setFormError(null);

    // Opening on the instalment that is actually due, prefilled with what it owes, is
    // what an administrator taking a payment over the phone needs.
    const next = order.nextDueInstallment;
    if (next) {
      setInstallmentNumber(String(next.number));
      setAmount(minorToAmountInput(next.outstandingMinor));
    } else {
      setInstallmentNumber('');
      setAmount('');
    }
  }, [order]);

  const amountMinor = useMemo(() => parseAmountToMinor(amount), [amount]);

  const remaining = useMemo(() => {
    if (!order || amountMinor === null) return null;
    return order.outstandingMinor - amountMinor;
  }, [order, amountMinor]);

  /** What the chosen instalment still owes, so a mismatch can be pointed out early. */
  const chosen = useMemo((): Installment | null => {
    if (!order || !installmentNumber) return null;
    return order.installments.find((entry) => String(entry.number) === installmentNumber) ?? null;
  }, [order, installmentNumber]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!order || saving) return;

    if (amountMinor === null || amountMinor <= 0) {
      setFieldErrors({ amountMinor: 'Enter an amount greater than zero.' });
      return;
    }
    if (amountMinor > order.outstandingMinor) {
      setFieldErrors({
        amountMinor: `That is more than the ${formatMoneyMinor(order.outstandingMinor)} outstanding.`,
      });
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await recordAdminOrderPayment(order.id, {
        amountMinor,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(installmentNumber ? { installmentNumber: Number(installmentNumber) } : {}),
      });

      toast.success(`${formatMoneyMinor(amountMinor)} recorded against ${order.reference}`);
      onRecorded(result);
      onClose();
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(messageFrom(error, 'Could not record this payment. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(order)}
      title="Record a payment"
      {...(order
        ? { description: `${order.reference} · ${order.customerName ?? 'Walk-in sale'}` }
        : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="order-payment-form" loading={saving}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="order-payment-form" className="form" onSubmit={submit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        {order ? (
          <InlineAlert tone="info">
            {formatMoneyMinor(order.paidMinor)} of {formatMoneyMinor(order.totalMinor)} paid.{' '}
            {formatMoneyMinor(order.outstandingMinor)} outstanding.
          </InlineAlert>
        ) : null}

        <TextField
          label="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          {...(fieldErrors.amountMinor ? { error: fieldErrors.amountMinor } : {})}
          inputMode="decimal"
          disabled={saving}
        />

        <SelectField
          label="How was it paid?"
          value={method}
          options={PAYMENT_METHOD_OPTIONS}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          {...(fieldErrors.method ? { error: fieldErrors.method } : {})}
          disabled={saving}
        />

        {unpaidInstallments.length > 0 ? (
          <SelectField
            label="Towards which instalment?"
            hint="Left unset, the payment fills the earliest unpaid instalments in order."
            value={installmentNumber}
            options={[
              { value: '', label: 'Earliest unpaid first' },
              ...unpaidInstallments.map((entry) => ({
                value: String(entry.number),
                label: `#${entry.number} · ${formatMoneyMinor(entry.outstandingMinor)} due ${formatDate(entry.dueDate)}`,
              })),
            ]}
            onChange={(event) => setInstallmentNumber(event.target.value)}
            {...(fieldErrors.installmentNumber ? { error: fieldErrors.installmentNumber } : {})}
            disabled={saving}
          />
        ) : null}

        <TextField
          label="Reference"
          optional
          hint="Transaction id, cheque number, UPI reference."
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          {...(fieldErrors.reference ? { error: fieldErrors.reference } : {})}
          disabled={saving}
        />

        <TextField
          label="Notes"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          {...(fieldErrors.notes ? { error: fieldErrors.notes } : {})}
          disabled={saving}
        />

        {chosen && amountMinor !== null && amountMinor > chosen.outstandingMinor ? (
          <p className="text-sm text-muted">
            Instalment #{chosen.number} only owes {formatMoneyMinor(chosen.outstandingMinor)}. The
            rest still counts towards the order, but it will not be attributed to a schedule row.
          </p>
        ) : null}

        {remaining !== null && remaining >= 0 ? (
          <p className="text-sm text-muted">
            {remaining === 0
              ? 'This settles the order in full.'
              : `${formatMoneyMinor(remaining)} will remain outstanding.`}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}

/* ----------------------------- instalment plan ---------------------------- */

interface PlanRow {
  amount: string;
  dueDate: string;
  notes: string;
}

interface InstallmentPlanDrawerProps {
  order: Order | null;
  onClose: () => void;
  onSaved: (order: Order) => void;
}

function blankRow(offsetDays: number): PlanRow {
  return { amount: '', dueDate: todayInput(offsetDays), notes: '' };
}

/**
 * Builds or replaces an order's instalment plan.
 *
 * The plan has to add up to the order total exactly, so the running total is shown as it
 * is edited rather than only after a failed save. "Split evenly" fills the amounts the way
 * the server would, remainder on the first instalment, so what is previewed is what is
 * stored.
 */
export function InstallmentPlanDrawer({ order, onClose, onSaved }: InstallmentPlanDrawerProps) {
  const toast = useToast();

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setFieldErrors({});
    setFormError(null);

    // An existing plan opens as it stands, so an administrator edits rather than retypes.
    if (order.installments.length > 0) {
      setRows(
        order.installments.map((entry) => ({
          amount: minorToAmountInput(entry.amountMinor),
          dueDate: entry.dueDate.slice(0, 10),
          notes: entry.notes ?? '',
        })),
      );
      return;
    }

    setRows([blankRow(7), blankRow(37)]);
  }, [order]);

  const plannedMinor = useMemo(
    () => rows.reduce((total, row) => total + (parseAmountToMinor(row.amount) ?? 0), 0),
    [rows],
  );

  const difference = (order?.totalMinor ?? 0) - plannedMinor;

  function updateRow(index: number, patch: Partial<PlanRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  /** Splits the order total across the rows, remainder on the first, as the server does. */
  function splitEvenly() {
    if (!order || rows.length === 0) return;

    const base = Math.floor(order.totalMinor / rows.length);
    const remainder = order.totalMinor - base * rows.length;

    setRows((current) =>
      current.map((row, index) => ({
        ...row,
        amount: minorToAmountInput(index === 0 ? base + remainder : base),
      })),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!order || saving) return;

    const installments: InstallmentInput[] = [];
    for (const [index, row] of rows.entries()) {
      const amountMinor = parseAmountToMinor(row.amount);
      if (amountMinor === null || amountMinor <= 0) {
        setFieldErrors({ [`installments[${index}].amountMinor`]: 'Enter an amount above zero.' });
        return;
      }
      if (!row.dueDate) {
        setFieldErrors({ [`installments[${index}].dueDate`]: 'Enter when this instalment is due.' });
        return;
      }
      installments.push({
        amountMinor,
        dueDate: new Date(`${row.dueDate}T00:00:00.000Z`).toISOString(),
        ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
      });
    }

    if (difference !== 0) {
      setFormError(
        difference > 0
          ? `The instalments are ${formatMoneyMinor(difference)} short of the order total.`
          : `The instalments are ${formatMoneyMinor(-difference)} more than the order total.`,
      );
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await setAdminInstallmentPlan(order.id, installments);
      toast.success(
        `${installments.length}-instalment plan saved`,
        `${order.reference} is now scheduled.`,
      );
      onSaved(result.order);
      onClose();
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(messageFrom(error, 'Could not save this plan. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(order)}
      wide
      title={order && order.installments.length > 0 ? 'Edit instalment plan' : 'Set an instalment plan'}
      {...(order ? { description: `${order.reference} · ${formatMoneyMinor(order.totalMinor)}` } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="installment-plan-form" loading={saving}>
            Save plan
          </Button>
        </>
      }
    >
      <form id="installment-plan-form" className="form" onSubmit={submit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        {order && order.paidMinor > 0 ? (
          <InlineAlert tone="info">
            {formatMoneyMinor(order.paidMinor)} has already been paid. It will be spread across the
            plan from the earliest instalment.
          </InlineAlert>
        ) : null}

        <div className="stack gap-3">
          {rows.map((row, index) => (
            <fieldset key={index} className="plan-row">
              <legend className="text-sm text-muted">Instalment {index + 1}</legend>

              <div className="row gap-3 wrap">
                <TextField
                  label={`Amount for instalment ${index + 1}`}
                  value={row.amount}
                  onChange={(event) => updateRow(index, { amount: event.target.value })}
                  {...(fieldErrors[`installments[${index}].amountMinor`]
                    ? { error: fieldErrors[`installments[${index}].amountMinor`]! }
                    : {})}
                  inputMode="decimal"
                  disabled={saving}
                />

                <TextField
                  label={`Due date for instalment ${index + 1}`}
                  type="date"
                  value={row.dueDate}
                  onChange={(event) => updateRow(index, { dueDate: event.target.value })}
                  {...(fieldErrors[`installments[${index}].dueDate`]
                    ? { error: fieldErrors[`installments[${index}].dueDate`]! }
                    : {})}
                  disabled={saving}
                />
              </div>

              <TextField
                label={`Note for instalment ${index + 1}`}
                optional
                value={row.notes}
                onChange={(event) => updateRow(index, { notes: event.target.value })}
                disabled={saving}
              />

              {rows.length > 1 ? (
                <Button
                  variant="ghost"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  disabled={saving}
                >
                  Remove instalment {index + 1}
                </Button>
              ) : null}
            </fieldset>
          ))}
        </div>

        <div className="row gap-2 wrap">
          <Button
            variant="secondary"
            onClick={() => setRows((current) => [...current, blankRow(7 + current.length * 30)])}
            disabled={saving || rows.length >= 36}
          >
            Add an instalment
          </Button>
          <Button variant="secondary" onClick={splitEvenly} disabled={saving}>
            Split evenly
          </Button>
        </div>

        {order ? (
          <p className="text-sm">
            {/* Shown while editing, because a plan that is a rupee out is refused. */}
            Planned {formatMoneyMinor(plannedMinor)} of {formatMoneyMinor(order.totalMinor)}.{' '}
            {difference === 0 ? (
              <Chip tone="success">Adds up</Chip>
            ) : (
              <Chip tone="warning">
                {difference > 0
                  ? `${formatMoneyMinor(difference)} short`
                  : `${formatMoneyMinor(-difference)} over`}
              </Chip>
            )}
          </p>
        ) : null}

        {order && order.installments.length > 0 && order.paidMinor > 0 ? (
          <p className="text-sm text-muted">
            This plan already has payments allocated against it, so the server will refuse to
            replace it. Current state:{' '}
            {order.installments
              .map((entry) => `#${entry.number} ${installmentStatusLabel(entry.status)}`)
              .join(', ')}
            .
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}

/* ------------------------------ delivery details ---------------------------- */

interface DeliveryDrawerProps {
  order: Order | null;
  onClose: () => void;
  onSaved: (order: Order) => void;
}

/**
 * Changes when and where an order is delivered. Three separate fields, each of which
 * can be left blank; only the ones that changed are sent.
 */
export function DeliveryDrawer({ order, onClose, onSaved }: DeliveryDrawerProps) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setDate(order.deliveryDate ?? '');
    setTime(order.deliveryTime ?? '');
    setLocation(order.deliveryLocation ?? '');
    setFieldErrors({});
    setFormError(null);
  }, [order]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!order || saving) return;

    const input: OrderDeliveryInput = {};
    if (date !== (order.deliveryDate ?? '')) input.deliveryDate = date || null;
    if (time !== (order.deliveryTime ?? '')) input.deliveryTime = time || null;
    if (location.trim() !== (order.deliveryLocation ?? '')) input.deliveryLocation = location.trim() || null;
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const result = await updateAdminOrderDelivery(order.id, input);
      toast.success(`Delivery details updated for ${order.reference}`);
      onSaved(result.order);
      onClose();
    } catch (error) {
      setFieldErrors(fieldErrorsFrom(error));
      setFormError(messageFrom(error, 'Could not save the delivery details. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(order)}
      title="Delivery details"
      {...(order ? { description: `${order.reference} · ${order.customerName ?? 'Walk-in sale'}` } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="order-delivery-form" loading={saving}>
            Save delivery details
          </Button>
        </>
      }
    >
      <form id="order-delivery-form" className="form" onSubmit={submit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <div className="field-grid">
          <TextField
            label="Delivery date"
            type="date"
            optional
            value={date}
            onChange={(event) => setDate(event.target.value)}
            {...(fieldErrors.deliveryDate ? { error: fieldErrors.deliveryDate } : {})}
            disabled={saving}
          />
          <TextField
            label="Delivery time"
            type="time"
            optional
            value={time}
            onChange={(event) => setTime(event.target.value)}
            {...(fieldErrors.deliveryTime ? { error: fieldErrors.deliveryTime } : {})}
            disabled={saving}
          />
        </div>

        <TextField
          label="Delivery location"
          optional
          hint="The full address, with a landmark if it helps."
          value={location}
          maxLength={500}
          onChange={(event) => setLocation(event.target.value)}
          {...(fieldErrors.deliveryLocation ? { error: fieldErrors.deliveryLocation } : {})}
          disabled={saving}
        />
      </form>
    </Drawer>
  );
}
