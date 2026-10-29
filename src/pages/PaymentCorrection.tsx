import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { correctAdminPayment, deleteAdminPayment } from '../api/endpoints';
import type { PayableSummary, PaymentCorrectionInput, PaymentEntry } from '../api/types';
import { Button, IconButton } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Drawer } from '../components/Drawer';
import { TextField } from '../components/Field';
import { EditIcon, TrashIcon } from '../components/Icon';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { formatDateTime, formatMoneyMinor } from '../utils/format';
import { minorToAmountInput, parseAmountToMinor, paymentMethodLabel } from '../utils/paymentFormat';

/**
 * Fixing a payment that was entered wrong: changing its amount, or deleting it.
 *
 * The server does the real work — it rebuilds the order or purchase from its payments,
 * including the instalment plan and every row's "left after this" — so after either
 * action the caller reloads rather than patching figures here.
 */

const payableLabel = (payment: PaymentEntry) =>
  `${payment.payableType === 'order' ? 'Order' : 'Purchase'} ${payment.payableReference}`;

/* -------------------------------- edit drawer ------------------------------- */

interface PaymentEditDrawerProps {
  payment: PaymentEntry | null;
  /**
   * What the order or purchase still owes, when the caller knows it, so the most this
   * payment can be raised to is shown up front. The server checks it regardless.
   */
  outstandingMinor?: number | null;
  onClose: () => void;
  onSaved: (result: { payment: PaymentEntry; payable: PayableSummary }) => void;
}

export function PaymentEditDrawer({ payment, outstandingMinor, onClose, onSaved }: PaymentEditDrawerProps) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setAmount(minorToAmountInput(payment.amountMinor));
    setReference(payment.reference ?? '');
    setNotes(payment.notes ?? '');
    setReason('');
    setFieldErrors({});
    setFormError(null);
  }, [payment]);

  const maxMinor =
    payment && outstandingMinor !== null && outstandingMinor !== undefined
      ? payment.amountMinor + outstandingMinor
      : null;
  const amountMinor = parseAmountToMinor(amount);
  const amountChanged = Boolean(payment && amountMinor !== null && amountMinor !== payment.amountMinor);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!payment || saving) return;

    if (amountMinor === null || amountMinor <= 0) {
      setFieldErrors({ amountMinor: 'Enter an amount greater than zero.' });
      return;
    }
    if (maxMinor !== null && amountMinor > maxMinor) {
      setFieldErrors({ amountMinor: `This payment can be at most ${formatMoneyMinor(maxMinor)}.` });
      return;
    }

    const input: PaymentCorrectionInput = {};
    if (amountChanged) input.amountMinor = amountMinor;
    if (reference.trim() !== (payment.reference ?? '')) input.reference = reference.trim() || null;
    if (notes.trim() !== (payment.notes ?? '')) input.notes = notes.trim() || null;
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    if (reason.trim()) input.reason = reason.trim();

    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const result = await correctAdminPayment(payment.id, input);
      toast.success(
        amountChanged
          ? `Payment changed from ${formatMoneyMinor(payment.amountMinor)} to ${formatMoneyMinor(amountMinor)}`
          : 'Payment details updated',
        `${result.payable.reference}: ${formatMoneyMinor(result.payable.outstandingMinor)} outstanding.`,
      );
      onSaved(result);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not save this correction. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={Boolean(payment)}
      title="Correct a payment"
      {...(payment ? { description: `${payableLabel(payment)} · recorded ${formatDateTime(payment.paidAt)}` } : {})}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="payment-correct-form" loading={saving}>
            Save correction
          </Button>
        </>
      }
    >
      <form id="payment-correct-form" className="form" onSubmit={submit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        {payment ? (
          <InlineAlert tone="info">
            Recorded as <strong>{formatMoneyMinor(payment.amountMinor)}</strong> by{' '}
            {paymentMethodLabel(payment.method).toLowerCase()}. Changing the amount recalculates
            what is paid and outstanding on {payment.payableReference}, including any instalments.
          </InlineAlert>
        ) : null}

        <TextField
          label="Correct amount"
          value={amount}
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          {...(maxMinor !== null ? { hint: `At most ${formatMoneyMinor(maxMinor)}, the most this order or purchase still allows.` } : {})}
          {...(fieldErrors.amountMinor ? { error: fieldErrors.amountMinor } : {})}
          disabled={saving}
        />

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

        <TextField
          label="Reason for the change"
          optional
          hint="Saved in the audit history, for example “Typed 4,000 instead of 400”."
          value={reason}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          {...(fieldErrors.reason ? { error: fieldErrors.reason } : {})}
          disabled={saving}
        />
      </form>
    </Drawer>
  );
}

/* ------------------------------- delete dialog ------------------------------ */

interface PaymentDeleteDialogProps {
  payment: PaymentEntry | null;
  onClose: () => void;
  onDeleted: (result: { payment: PaymentEntry; payable: PayableSummary }) => void;
}

export function PaymentDeleteDialog({ payment, onClose, onDeleted }: PaymentDeleteDialogProps) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (payment) setReason('');
  }, [payment]);

  async function confirm() {
    if (!payment || busy) return;
    setBusy(true);
    try {
      const result = await deleteAdminPayment(payment.id, reason);
      toast.success(
        `${formatMoneyMinor(payment.amountMinor)} payment deleted`,
        `${result.payable.reference}: ${formatMoneyMinor(result.payable.outstandingMinor)} outstanding.`,
      );
      onDeleted(result);
      onClose();
    } catch (error) {
      toast.error(
        'Could not delete this payment',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(payment)}
      title="Delete this payment?"
      message={
        payment ? (
          <div className="stack gap-3">
            <p>
              The {formatMoneyMinor(payment.amountMinor)} {paymentMethodLabel(payment.method).toLowerCase()}{' '}
              payment on {payment.payableReference} will be removed, and what is paid and outstanding
              recalculated. Use this for a duplicate or a payment recorded against the wrong record.
              A copy is kept in the audit history.
            </p>
            <TextField
              label="Reason"
              optional
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />
          </div>
        ) : null
      }
      confirmLabel="Delete payment"
      cancelLabel="Keep it"
      destructive
      busy={busy}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}

/* --------------------------------- row actions ------------------------------ */

export function PaymentActions({
  payment,
  onEdit,
  onDelete,
}: {
  payment: PaymentEntry;
  onEdit: (payment: PaymentEntry) => void;
  onDelete: (payment: PaymentEntry) => void;
}) {
  const amount = formatMoneyMinor(payment.amountMinor);
  return (
    <span className="row gap-1">
      <IconButton label={`Correct the ${amount} payment`} icon={<EditIcon />} onClick={() => onEdit(payment)} />
      <IconButton label={`Delete the ${amount} payment`} icon={<TrashIcon />} onClick={() => onDelete(payment)} />
    </span>
  );
}

/* ------------------------------ payment timeline ---------------------------- */

interface PaymentTimelineProps {
  payments: PaymentEntry[];
  emptyText: string;
  /** Whether this administrator may correct and delete payments. */
  canManage: boolean;
  /** What the order or purchase still owes, to bound a correction. */
  outstandingMinor: number | null;
  /** Called after a correction or deletion; the caller reloads the record. */
  onChanged: () => void;
}

/** The payments on one order or purchase, newest first, with correction controls. */
export function PaymentTimeline({ payments, emptyText, canManage, outstandingMinor, onChanged }: PaymentTimelineProps) {
  const [editing, setEditing] = useState<PaymentEntry | null>(null);
  const [deleting, setDeleting] = useState<PaymentEntry | null>(null);

  return (
    <>
      {payments.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="timeline">
          {payments.map((payment) => (
            <li key={payment.id} className="timeline__entry payment-row">
              <div className="row-between">
                <span className="text-medium text-numeric">{formatMoneyMinor(payment.amountMinor)}</span>
                <span className="row gap-2">
                  <span className="text-sm text-muted">{formatDateTime(payment.paidAt)}</span>
                  {canManage ? (
                    <span className="payment-row__actions">
                      <PaymentActions payment={payment} onEdit={setEditing} onDelete={setDeleting} />
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="row gap-2 wrap text-sm text-secondary">
                <span>{paymentMethodLabel(payment.method)}</span>
                {payment.installmentNumber ? <span>Instalment #{payment.installmentNumber}</span> : null}
                {payment.reference ? <span className="text-mono text-xs">{payment.reference}</span> : null}
                <span>{formatMoneyMinor(payment.balanceAfterMinor)} left after this</span>
                {/* A merchant should be able to see that support recorded it. */}
                {payment.actorType === 'admin' ? <Chip tone="info">Recorded by {payment.actorLabel}</Chip> : null}
              </div>
              {payment.notes ? <p className="text-sm">{payment.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}

      <PaymentEditDrawer
        payment={editing}
        outstandingMinor={outstandingMinor}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
      <PaymentDeleteDialog payment={deleting} onClose={() => setDeleting(null)} onDeleted={onChanged} />
    </>
  );
}
