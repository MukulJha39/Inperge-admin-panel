import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { adjustStock, setAdminStockQuantity } from '../api/endpoints';
import type {
  CatalogItem,
  CatalogMaterial,
  StockAdjustmentReason,
  StockSubjectType,
} from '../api/types';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { STOCK_REASON_OPTIONS, formatQuantity, unitLabel } from '../utils/format';

/**
 * The minimum a stock adjustment needs to know about its subject, so the drawer works
 * from a full catalog row or from a low-stock summary row alike.
 */
export interface StockSubject {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  subjectType: StockSubjectType;
}

interface StockAdjustDrawerProps {
  subject: StockSubject | null;
  onClose: () => void;
  onAdjusted: (updated: CatalogItem | CatalogMaterial) => void;
}

/** Down, up, or straight to a counted figure (a recount). */
type Direction = 'remove' | 'add' | 'set';

/**
 * Records a stock correction on a merchant's behalf.
 *
 * Direction and amount are separate inputs rather than one signed number, because
 * "remove 4" is far harder to get wrong than "-4". A reason is mandatory, so no
 * quantity change is ever unexplained (PRD section 12).
 */
export function StockAdjustDrawer({ subject, onClose, onAdjusted }: StockAdjustDrawerProps) {
  const toast = useToast();

  const [direction, setDirection] = useState<Direction>('remove');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<StockAdjustmentReason>('damaged');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subject) return;
    setDirection('remove');
    setAmount('');
    setReason('damaged');
    setNote('');
    setFieldErrors({});
    setFormError(null);
  }, [subject]);

  const resultingQuantity = useMemo(() => {
    if (!subject) return null;
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed)) return null;
    if (direction === 'set') return parsed;
    return subject.quantity + (direction === 'add' ? parsed : -parsed);
  }, [subject, amount, direction]);

  if (!subject) return null;

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const parsed = Number(amount);

    if (!amount.trim()) {
      errors.amount = direction === 'set' ? 'Enter the quantity you counted.' : 'Enter how much stock changed.';
    } else if (Number.isNaN(parsed)) errors.amount = 'Enter a number.';
    else if (direction === 'set' ? parsed < 0 : parsed <= 0) {
      errors.amount = direction === 'set' ? 'Enter zero or more.' : 'Enter an amount greater than zero.';
    }
    else if (Math.abs(parsed * 1000 - Math.round(parsed * 1000)) > 1e-6) {
      errors.amount = 'Use at most three decimal places.';
    } else if (direction === 'remove' && parsed > subject!.quantity) {
      errors.amount = `Only ${formatQuantity(subject!.quantity, subject!.unit)} is available.`;
    }

    if (note.trim().length > 0 && note.trim().length < 3) {
      errors.note = 'Give a note of at least 3 characters, or leave it empty.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!subject || !validate() || saving) return;

    setSaving(true);
    try {
      const result =
        direction === 'set'
          ? await setAdminStockQuantity(subject.subjectType, subject.id, {
              quantity: Number(amount),
              reason,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          : await adjustStock(subject.subjectType, subject.id, {
              change: direction === 'add' ? Number(amount) : -Number(amount),
              reason,
              ...(note.trim() ? { note: note.trim() } : {}),
            });

      const updated = result.item ?? result.material;
      if (updated) onAdjusted(updated);

      toast.success(
        'Stock updated',
        `${subject.name} is now ${formatQuantity(result.movement.balanceAfter, subject.unit)}.`,
      );
      onClose();
    } catch (error) {
      // The drawer stays open so nothing entered is lost.
      if (error instanceof ApiError) {
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      title="Adjust stock"
      description={`${subject.name} — currently ${formatQuantity(subject.quantity, subject.unit)}`}
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" form="stock-adjust-form" type="submit" loading={saving}>
            {direction === 'set' ? 'Save count' : 'Record adjustment'}
          </Button>
        </>
      }
    >
      <form id="stock-adjust-form" className="stack gap-5" onSubmit={handleSubmit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <InlineAlert tone="info">
          Every adjustment is written to the merchant&apos;s stock ledger with your name and the
          reason you choose, and appears in their app.
        </InlineAlert>

        <SelectField
          label="What happened"
          options={[
            { value: 'remove', label: 'Stock went down' },
            { value: 'add', label: 'Stock went up' },
            { value: 'set', label: 'Set to a counted figure' },
          ]}
          value={direction}
          onChange={(event) => {
            const next = event.target.value as Direction;
            setDirection(next);
            // A count is a recount unless the administrator says otherwise.
            if (next === 'set') setReason('recount');
          }}
        />

        <TextField
          label={`${direction === 'set' ? 'Counted quantity' : 'Amount'} in ${unitLabel(subject.unit)}`}
          type="number"
          step="0.001"
          min="0"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setFieldErrors((current) => ({ ...current, amount: '' }));
          }}
          {...(fieldErrors.amount ? { error: fieldErrors.amount } : {})}
          {...(resultingQuantity !== null && !fieldErrors.amount
            ? { hint: `New quantity: ${formatQuantity(resultingQuantity, subject.unit)}` }
            : {})}
        />

        <SelectField
          label="Reason"
          options={STOCK_REASON_OPTIONS}
          value={reason}
          onChange={(event) => setReason(event.target.value as StockAdjustmentReason)}
          hint="Recorded in the ledger so the change can be explained later."
          {...(fieldErrors.reason ? { error: fieldErrors.reason } : {})}
        />

        <TextField
          label="Note"
          optional
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          placeholder="What prompted this correction?"
          {...(fieldErrors.note ? { error: fieldErrors.note } : {})}
        />
      </form>
    </Drawer>
  );
}
