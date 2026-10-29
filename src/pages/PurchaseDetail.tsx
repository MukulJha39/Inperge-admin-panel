import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { cancelAdminPurchase, fetchAdminPurchase } from '../api/endpoints';
import type { PaymentEntry, Purchase } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { RELATIONSHIP_PERMISSIONS } from '../auth/permissions';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Drawer } from '../components/Drawer';
import { DetailSkeleton, ErrorState, InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { formatDate, formatDateTime, formatMoneyMinor, formatQuantity } from '../utils/format';
import { paymentStateLabel, paymentStateTone } from '../utils/paymentFormat';
import { PaymentTimeline } from './PaymentCorrection';
import { PaymentDrawer } from './RelationshipDrawers';

interface PurchaseDetailPanelProps {
  purchaseId: string | null;
  onClose: () => void;
  /** Called after a cancellation or a payment, so the list behind can refresh. */
  onChanged: () => void;
}

/**
 * One purchase in full: its lines, its totals, and every payment made against it.
 *
 * A drawer rather than a page because it is reached from a table row and the
 * administrator is usually working through a list; the URL stays where they were.
 */
export function PurchaseDetailPanel({
  purchaseId,
  onClose,
  onChanged,
}: PurchaseDetailPanelProps) {
  const { can } = useAuth();
  const toast = useToast();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<Purchase | null>(null);

  const canCancel = can(RELATIONSHIP_PERMISSIONS.PURCHASE_MANAGE);
  const canPay = can(RELATIONSHIP_PERMISSIONS.PAYMENT_MANAGE);

  const load = useCallback(
    async (id: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdminPurchase(id, signal);
        setPurchase(result.purchase);
        setPayments(result.payments);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setPurchase(null);
        setPayments([]);
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load this purchase. Please try again.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!purchaseId) {
      setPurchase(null);
      setPayments([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    void load(purchaseId, controller.signal);
    return () => controller.abort();
  }, [purchaseId, load]);

  async function confirmCancel() {
    if (!purchase) return;
    setBusy(true);
    try {
      await cancelAdminPurchase(purchase.id);
      toast.success(
        `${purchase.reference} cancelled`,
        purchase.received ? 'The stock it brought in has been put back.' : undefined,
      );
      setCancelling(false);
      onChanged();
      await load(purchase.id);
    } catch (requestError) {
      // The server refuses to cancel a paid purchase, or one whose stock has since been
      // sold, and explains which.
      toast.error(
        'Could not cancel this purchase',
        requestError instanceof ApiError ? requestError.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Drawer
        open={Boolean(purchaseId)}
        wide
        title={purchase ? `Purchase ${purchase.reference}` : 'Purchase'}
        {...(purchase
          ? { description: `${purchase.supplierName} · ${purchase.merchantName ?? ''}` }
          : {})}
        onClose={onClose}
        footer={
          purchase && purchase.status === 'recorded' ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              {canPay && purchase.outstandingMinor > 0 ? (
                <Button onClick={() => setPaying(purchase)}>Record a payment</Button>
              ) : null}
              {canCancel ? (
                <Button variant="danger" onClick={() => setCancelling(true)}>
                  Cancel purchase
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        {loading ? <DetailSkeleton /> : null}

        {error ? <ErrorState message={error} onRetry={() => purchaseId && void load(purchaseId)} /> : null}

        {purchase && !loading ? (
          <div className="stack gap-5">
            {purchase.status === 'cancelled' ? (
              <InlineAlert tone="warning">
                Cancelled {formatDateTime(purchase.cancelledAt)}
                {purchase.cancelledReason ? `: ${purchase.cancelledReason}` : '.'}
              </InlineAlert>
            ) : null}

            {purchase.status === 'recorded' && !purchase.received ? (
              <InlineAlert tone="info">
                The stock on this purchase has not been received yet, so it is not counted in
                available quantities.
              </InlineAlert>
            ) : null}

            <dl className="detail-grid">
              <div>
                <dt>Payment</dt>
                <dd>
                  <Chip tone={paymentStateTone(purchase.paymentState)} dot>
                    {paymentStateLabel(purchase.paymentState)}
                  </Chip>
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd className="text-numeric">{formatMoneyMinor(purchase.totalMinor)}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd className="text-numeric">{formatMoneyMinor(purchase.paidMinor)}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd className="text-numeric">{formatMoneyMinor(purchase.outstandingMinor)}</dd>
              </div>
              <div>
                <dt>Purchased</dt>
                <dd>{formatDateTime(purchase.purchaseDate)}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatDate(purchase.dueDate)}</dd>
              </div>
              <div>
                <dt>Stock received</dt>
                <dd>{purchase.received ? formatDateTime(purchase.receivedAt) : 'Not yet'}</dd>
              </div>
            </dl>

            <section className="stack gap-2">
              <h3 className="text-sm text-muted text-upper">What was bought</h3>
              <table className="table table--compact">
                <caption className="sr-only">Purchase lines</caption>
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Quantity</th>
                    <th scope="col" className="numeric">
                      Unit cost
                    </th>
                    <th scope="col" className="numeric">
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.lines.map((line) => (
                    <tr key={`${line.subjectType}:${line.subjectId}`}>
                      <td>
                        <div className="stack gap-1">
                          {/* The name as it was when the purchase was recorded. */}
                          <span>{line.name}</span>
                          <span className="text-xs text-muted">
                            {line.subjectType === 'material' ? 'Raw material' : 'Product'}
                          </span>
                        </div>
                      </td>
                      <td>{formatQuantity(line.quantity, line.unit)}</td>
                      <td className="numeric text-numeric">
                        {formatMoneyMinor(line.unitCostMinor)}
                      </td>
                      <td className="numeric text-numeric">
                        {formatMoneyMinor(line.lineTotalMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>
                      Subtotal
                    </th>
                    <td className="numeric text-numeric">
                      {formatMoneyMinor(purchase.subtotalMinor)}
                    </td>
                  </tr>
                  {purchase.additionalCostMinor > 0 ? (
                    <tr>
                      <th scope="row" colSpan={3}>
                        Other costs
                      </th>
                      <td className="numeric text-numeric">
                        {formatMoneyMinor(purchase.additionalCostMinor)}
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <th scope="row" colSpan={3}>
                      Total
                    </th>
                    <td className="numeric text-numeric text-medium">
                      {formatMoneyMinor(purchase.totalMinor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="stack gap-2">
              <h3 className="text-sm text-muted text-upper">Payments</h3>
              <PaymentTimeline
                payments={payments}
                emptyText="Nothing has been paid against this purchase yet."
                canManage={canPay}
                outstandingMinor={Math.max(0, purchase.totalMinor - purchase.paidMinor)}
                onChanged={() => {
                  onChanged();
                  if (purchase) void load(purchase.id);
                }}
              />
            </section>

            {purchase.notes ? (
              <section className="stack gap-2">
                <h3 className="text-sm text-muted text-upper">Notes</h3>
                <p className="text-sm">{purchase.notes}</p>
              </section>
            ) : null}

            <p className="text-xs text-muted">Recorded {formatDateTime(purchase.createdAt)}</p>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={cancelling}
        title="Cancel this purchase?"
        message={
          purchase?.received
            ? `${purchase.reference} will be cancelled and the stock it brought in put back. If any of it has already been sold, the server will refuse rather than drive stock negative.`
            : `${purchase?.reference ?? 'This purchase'} will be cancelled. A purchase with payments against it cannot be cancelled.`
        }
        confirmLabel="Cancel purchase"
        cancelLabel="Keep it"
        destructive
        busy={busy}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(false)}
      />

      <PaymentDrawer
        purchase={paying}
        onClose={() => setPaying(null)}
        onRecorded={(result) => {
          setPurchase(result.purchase);
          setPayments((current) => [result.payment, ...current]);
          onChanged();
        }}
      />
    </>
  );
}
