import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../api/client';
import { updateMerchantStatus } from '../api/endpoints';
import type { Merchant } from '../api/types';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { useFocusTrap } from '../utils/useFocusTrap';

interface MerchantStatusDialogProps {
  merchant: Merchant | null;
  onClose: () => void;
  onChanged: (merchant: Merchant) => void;
}

/**
 * Suspending a merchant signs them out of every device immediately, so it is
 * confirmed explicitly and the reason is recorded in the audit history.
 */
export function MerchantStatusDialog({ merchant, onClose, onChanged }: MerchantStatusDialogProps) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusTrap(dialogRef, {
    active: merchant !== null,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    setReason('');
    setError(null);
  }, [merchant]);

  if (!merchant) return null;

  const suspending = merchant.status === 'active';
  const nextStatus = suspending ? 'suspended' : 'active';

  async function handleConfirm() {
    if (busy || !merchant) return;

    if (suspending && reason.trim().length > 0 && reason.trim().length < 3) {
      setError('Give a reason of at least 3 characters, or leave it empty.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { merchant: updated } = await updateMerchantStatus(
        merchant.id,
        nextStatus,
        suspending ? reason.trim() || undefined : undefined,
      );

      toast.success(
        suspending ? 'Merchant suspended' : 'Merchant reactivated',
        suspending
          ? `${updated.fullName} has been signed out of all devices.`
          : `${updated.fullName} can sign in again.`,
      );
      onChanged(updated);
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div ref={dialogRef} className="dialog" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="dialog__body stack gap-4">
          <div>
            <h2 className="dialog__title">{suspending ? 'Suspend merchant' : 'Reactivate merchant'}</h2>
            <p className="dialog__message">
              {suspending ? (
                <>
                  <strong>{merchant.fullName}</strong> will be signed out of every device immediately and will
                  not be able to sign in until reactivated.
                </>
              ) : (
                <>
                  <strong>{merchant.fullName}</strong> will be able to sign in again with their verified phone
                  number.
                </>
              )}
            </p>
          </div>

          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          {suspending ? (
            <TextField
              label="Reason"
              optional
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder="Recorded in the audit history"
              hint="Visible to admins reviewing this account later."
            />
          ) : null}
        </div>

        <div className="dialog__footer">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={suspending ? 'danger' : 'primary'} onClick={handleConfirm} loading={busy}>
            {suspending ? 'Suspend merchant' : 'Reactivate merchant'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
