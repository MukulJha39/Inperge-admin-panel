import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteAdminItem, deleteAdminMaterial, deleteAdminService } from '../api/endpoints';
import { ERROR_CODES } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { formatQuantity } from '../utils/format';

export type DeletableKind = 'item' | 'service' | 'material';

export interface DeletableRecord {
  id: string;
  name: string;
  /** Stock on hand, for the two kinds that carry any. */
  quantity?: number;
  unit?: string;
  trackStock?: boolean;
}

const LABEL: Record<DeletableKind, string> = {
  item: 'product',
  service: 'service',
  material: 'raw material',
};

const DELETER: Record<DeletableKind, (id: string) => Promise<{ name: string }>> = {
  item: deleteAdminItem,
  service: deleteAdminService,
  material: deleteAdminMaterial,
};

interface CatalogDeleteDialogProps {
  kind: DeletableKind;
  record: DeletableRecord | null;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Permanently removing a catalog record.
 *
 * Separate from the archive confirmation because the two are not the same act and must not
 * look the same. Archiving hides a record; this destroys it, along with its stock ledger
 * and its image, and nothing brings it back.
 *
 * The API refuses to delete a record that any order or purchase still points at. That
 * refusal is shown here in place, with the advice it carries — archive instead — rather
 * than as a toast that vanishes while the dialog sits open asking the same question again.
 */
export function CatalogDeleteDialog({ kind, record, onClose, onDeleted }: CatalogDeleteDialogProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [inUse, setInUse] = useState(false);

  // A refusal belongs to the record that caused it, not to the next one opened.
  useEffect(() => {
    if (!record) return;
    setRefusal(null);
    setInUse(false);
  }, [record]);

  async function handleConfirm() {
    if (!record) return;
    setBusy(true);
    setRefusal(null);
    try {
      await DELETER[kind](record.id);
      toast.success(`${LABEL[kind][0]?.toUpperCase()}${LABEL[kind].slice(1)} deleted`, `${record.name} has been removed.`);
      onDeleted();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setInUse(error.code === ERROR_CODES.RECORD_IN_USE);
        setRefusal(error.message);
      } else {
        setInUse(false);
        setRefusal(`Could not delete this ${LABEL[kind]}. Please try again.`);
      }
    } finally {
      setBusy(false);
    }
  }

  const holdsStock =
    record?.trackStock !== false && typeof record?.quantity === 'number' && record.quantity > 0;

  return (
    <ConfirmDialog
      open={record !== null}
      destructive
      busy={busy}
      title={`Permanently delete ${record?.name ?? `this ${LABEL[kind]}`}?`}
      confirmLabel={inUse ? 'Close' : `Delete ${LABEL[kind]}`}
      cancelLabel={inUse ? 'Cancel' : 'Keep it'}
      onConfirm={inUse ? onClose : handleConfirm}
      onCancel={onClose}
      message={
        <div className="stack gap-3">
          {refusal ? (
            <InlineAlert tone={inUse ? 'warning' : 'error'}>{refusal}</InlineAlert>
          ) : null}

          {inUse ? null : (
            <>
              <p>
                This removes the {LABEL[kind]} itself, its image, and everything recorded about
                it. It cannot be undone.
              </p>

              {holdsStock ? (
                <InlineAlert tone="warning">
                  {record?.name} still holds{' '}
                  <strong>{formatQuantity(record?.quantity ?? 0, record?.unit)}</strong> in stock.
                  Its whole stock history goes with it.
                </InlineAlert>
              ) : null}

              <p className="text-sm text-secondary">
                To hide it from the merchant without losing any of that, archive it instead.
              </p>
            </>
          )}
        </div>
      }
    />
  );
}
