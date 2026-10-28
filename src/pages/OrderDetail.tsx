import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { cancelAdminOrder, fetchAdminOrder, transitionAdminOrder } from '../api/endpoints';
import type { Order, OrderStatus, PaymentEntry } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ORDER_PERMISSIONS } from '../auth/permissions';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Drawer } from '../components/Drawer';
import { DetailSkeleton, ErrorState, InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { formatDate, formatDateTime, formatMoneyMinor, formatQuantity } from '../utils/format';
import {
  customerLabel,
  discountLabel,
  installmentStatusLabel,
  installmentTone,
  lineTypeLabel,
  orderStatusLabel,
  orderStatusTone,
} from '../utils/orderFormat';
import { paymentMethodLabel, paymentStateLabel, paymentStateTone } from '../utils/paymentFormat';
import { InstallmentPlanDrawer, OrderPaymentDrawer } from './OrderDrawers';

interface OrderDetailPanelProps {
  orderId: string | null;
  onClose: () => void;
  /** Called after a transition, a payment or a plan change, so the list behind refreshes. */
  onChanged: () => void;
}

/**
 * One order in full: its lines, its totals, its payment timeline and its instalment plan.
 *
 * A drawer rather than a page because it is reached from a table row and the administrator
 * is usually working through a list; the URL stays where they were.
 */
export function OrderDetailPanel({ orderId, onClose, onChanged }: OrderDetailPanelProps) {
  const { can } = useAuth();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  /** Which statuses this order may move to, as the server reports them. */
  const [allowed, setAllowed] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelling, setCancelling] = useState(false);
  const [moving, setMoving] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [planning, setPlanning] = useState<Order | null>(null);

  const canEdit = can(ORDER_PERMISSIONS.ORDER_EDIT);
  const canCancel = can(ORDER_PERMISSIONS.ORDER_CANCEL);
  const canPay = can(ORDER_PERMISSIONS.PAYMENT_MANAGE);
  const canPlan = can(ORDER_PERMISSIONS.INSTALLMENT_MANAGE);

  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminOrder(id, signal);
      setOrder(result.order);
      setPayments(result.payments);
      setAllowed(result.allowedTransitions);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setOrder(null);
      setPayments([]);
      setAllowed([]);
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not load this order. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setPayments([]);
      setAllowed([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    void load(orderId, controller.signal);
    return () => controller.abort();
  }, [orderId, load]);

  async function confirmMove() {
    if (!order || !moving) return;
    setBusy(true);
    try {
      const result = await transitionAdminOrder(order.id, moving);
      toast.success(
        `${order.reference} is now ${orderStatusLabel(moving).toLowerCase()}`,
        order.stockCommitted !== result.order.stockCommitted
          ? 'Its stock moved with it.'
          : undefined,
      );
      setOrder(result.order);
      setAllowed(result.allowedTransitions);
      setMoving(null);
      onChanged();
    } catch (requestError) {
      // The server refuses a transition that is not on the map, and says what is.
      toast.error(
        'Could not move this order on',
        requestError instanceof ApiError ? requestError.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (!order) return;
    setBusy(true);
    try {
      await cancelAdminOrder(order.id);
      toast.success(
        `${order.reference} cancelled`,
        order.stockCommitted ? 'The stock it was holding has been put back.' : undefined,
      );
      setCancelling(false);
      onChanged();
      await load(order.id);
    } catch (requestError) {
      // An order that has taken money cannot be cancelled; the server says how much.
      toast.error(
        'Could not cancel this order',
        requestError instanceof ApiError ? requestError.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  /** The statuses worth offering as buttons: cancelling has its own, destructive, control. */
  const nextStatuses = allowed.filter((status) => status !== 'cancelled');

  return (
    <>
      <Drawer
        open={Boolean(orderId)}
        wide
        title={order ? `Order ${order.reference}` : 'Order'}
        {...(order
          ? {
              description: `${customerLabel(order.customerName)} · ${order.merchantName ?? ''}`,
            }
          : {})}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>

            {order && canPay && order.outstandingMinor > 0 && order.status !== 'cancelled' ? (
              <Button onClick={() => setPaying(order)}>Record a payment</Button>
            ) : null}

            {order && canPlan && order.status !== 'cancelled' && order.status !== 'returned' ? (
              <Button variant="secondary" onClick={() => setPlanning(order)}>
                {order.installments.length > 0 ? 'Edit plan' : 'Set a plan'}
              </Button>
            ) : null}

            {order && canCancel && allowed.includes('cancelled') ? (
              <Button variant="danger" onClick={() => setCancelling(true)}>
                Cancel order
              </Button>
            ) : null}
          </>
        }
      >
        {loading ? <DetailSkeleton /> : null}

        {error ? <ErrorState message={error} onRetry={() => orderId && void load(orderId)} /> : null}

        {order && !loading ? (
          <div className="stack gap-5">
            {order.status === 'cancelled' ? (
              <InlineAlert tone="warning">
                Cancelled {formatDateTime(order.cancelledAt)}
                {order.cancelledReason ? `: ${order.cancelledReason}` : '.'}
              </InlineAlert>
            ) : null}

            {order.status === 'returned' ? (
              <InlineAlert tone="warning">
                Returned {formatDateTime(order.returnedAt)}
                {order.returnedReason ? `: ${order.returnedReason}` : '.'}
              </InlineAlert>
            ) : null}

            {order.status === 'draft' ? (
              <InlineAlert tone="info">
                This is a draft. Nothing has been committed — no stock has moved and nothing is
                owed until it is confirmed.
              </InlineAlert>
            ) : null}

            {/* What the order may become next, offered as buttons rather than a free
                dropdown, so an administrator cannot aim at a status the server refuses. */}
            {canEdit && nextStatuses.length > 0 ? (
              <section className="stack gap-2">
                <h3 className="text-sm text-muted text-upper">Move this order on</h3>
                <div className="row gap-2 wrap">
                  {nextStatuses.map((status) => (
                    <Button key={status} variant="secondary" onClick={() => setMoving(status)}>
                      Mark {orderStatusLabel(status).toLowerCase()}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            <dl className="detail-grid">
              <div>
                <dt>Status</dt>
                <dd>
                  <Chip tone={orderStatusTone(order.status)} dot>
                    {orderStatusLabel(order.status)}
                  </Chip>
                </dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  <Chip tone={paymentStateTone(order.paymentState)} dot>
                    {paymentStateLabel(order.paymentState)}
                  </Chip>
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd className="text-numeric">{formatMoneyMinor(order.totalMinor)}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd className="text-numeric">{formatMoneyMinor(order.paidMinor)}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd className="text-numeric">{formatMoneyMinor(order.outstandingMinor)}</dd>
              </div>
              <div>
                <dt>Ordered</dt>
                <dd>{formatDateTime(order.orderDate)}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatDate(order.dueDate)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{order.completedAt ? formatDateTime(order.completedAt) : 'Not yet'}</dd>
              </div>
              <div>
                <dt>Holding stock</dt>
                <dd>
                  {order.stockCommitted
                    ? `Since ${formatDateTime(order.stockCommittedAt)}`
                    : 'No'}
                </dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>
                  {order.customerId ? (
                    <Link to={`/customers?search=${encodeURIComponent(order.customerName ?? '')}`} className="row-link">
                      {order.customerName}
                    </Link>
                  ) : (
                    // An anonymous sale has nobody to name, and saying so is better than
                    // an empty cell.
                    <span className="text-secondary">Walk-in sale</span>
                  )}
                </dd>
              </div>
            </dl>

            <section className="stack gap-2">
              <h3 className="text-sm text-muted text-upper">What was sold</h3>
              <table className="table table--compact">
                <caption className="sr-only">Order lines</caption>
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Quantity</th>
                    <th scope="col" className="numeric">
                      Rate
                    </th>
                    <th scope="col" className="numeric">
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={`${line.lineType}:${line.subjectId}`}>
                      <td>
                        <div className="stack gap-1">
                          {/* The name as it was when the order was written. */}
                          <span>{line.name}</span>
                          <span className="text-xs text-muted">
                            {lineTypeLabel(line.lineType)}
                            {line.durationMinutes ? ` · ${line.durationMinutes} min` : ''}
                          </span>
                        </div>
                      </td>
                      <td>{formatQuantity(line.quantity, line.unit ?? line.billingUnit ?? '')}</td>
                      <td className="numeric text-numeric">
                        {formatMoneyMinor(line.unitRateMinor)}
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
                      {formatMoneyMinor(order.subtotalMinor)}
                    </td>
                  </tr>
                  {order.discountMinor > 0 ? (
                    <tr>
                      <th scope="row" colSpan={3}>
                        {discountLabel(order.discountType, order.discountPercent) ?? 'Discount'}
                      </th>
                      <td className="numeric text-numeric">
                        −{formatMoneyMinor(order.discountMinor)}
                      </td>
                    </tr>
                  ) : null}
                  {order.taxMinor > 0 ? (
                    <tr>
                      <th scope="row" colSpan={3}>
                        {/* Charged on the discounted subtotal, which is the order a
                            merchant can check by hand. */}
                        Tax ({order.taxPercent ?? 0}%)
                      </th>
                      <td className="numeric text-numeric">{formatMoneyMinor(order.taxMinor)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <th scope="row" colSpan={3}>
                      Total
                    </th>
                    <td className="numeric text-numeric text-medium">
                      {formatMoneyMinor(order.totalMinor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {order.installments.length > 0 ? (
              <section className="stack gap-2">
                <h3 className="text-sm text-muted text-upper">Instalment plan</h3>
                <table className="table table--compact">
                  <caption className="sr-only">Instalments on this order</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Due</th>
                      <th scope="col" className="numeric">
                        Amount
                      </th>
                      <th scope="col" className="numeric">
                        Outstanding
                      </th>
                      <th scope="col">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.installments.map((entry) => (
                      <tr key={entry.number}>
                        <td>{entry.number}</td>
                        <td>
                          <div className="stack gap-1">
                            <span>{formatDate(entry.dueDate)}</span>
                            {/* The one the merchant should be chasing next. */}
                            {entry.isNextDue ? (
                              <span className="text-xs text-muted">Next due</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="numeric text-numeric">
                          {formatMoneyMinor(entry.amountMinor)}
                        </td>
                        <td className="numeric text-numeric">
                          {formatMoneyMinor(entry.outstandingMinor)}
                        </td>
                        <td>
                          <Chip tone={installmentTone(entry.status, entry.isOverdue)} dot>
                            {entry.isOverdue ? 'Overdue' : installmentStatusLabel(entry.status)}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            <section className="stack gap-2">
              <h3 className="text-sm text-muted text-upper">Payments</h3>
              {payments.length === 0 ? (
                <p className="text-sm text-muted">Nothing has been paid against this order yet.</p>
              ) : (
                <ul className="timeline">
                  {payments.map((payment) => (
                    <li key={payment.id} className="timeline__entry">
                      <div className="row-between">
                        <span className="text-medium text-numeric">
                          {formatMoneyMinor(payment.amountMinor)}
                        </span>
                        <span className="text-sm text-muted">{formatDateTime(payment.paidAt)}</span>
                      </div>
                      <div className="row gap-2 wrap text-sm text-secondary">
                        <span>{paymentMethodLabel(payment.method)}</span>
                        {payment.installmentNumber ? (
                          <span>Instalment #{payment.installmentNumber}</span>
                        ) : null}
                        {payment.reference ? (
                          <span className="text-mono text-xs">{payment.reference}</span>
                        ) : null}
                        <span>{formatMoneyMinor(payment.balanceAfterMinor)} left after this</span>
                        {/* A merchant should be able to see that support recorded it. */}
                        {payment.actorType === 'admin' ? (
                          <Chip tone="info">Recorded by {payment.actorLabel}</Chip>
                        ) : null}
                      </div>
                      {payment.notes ? <p className="text-sm">{payment.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {order.notes ? (
              <section className="stack gap-2">
                <h3 className="text-sm text-muted text-upper">Notes</h3>
                <p className="text-sm">{order.notes}</p>
              </section>
            ) : null}

            <p className="text-xs text-muted">Written {formatDateTime(order.createdAt)}</p>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(moving)}
        title={moving ? `Mark this order ${orderStatusLabel(moving).toLowerCase()}?` : 'Move this order on?'}
        message={
          moving === 'returned'
            ? `${order?.reference ?? 'This order'} will be marked returned and the stock it sold put back.`
            : order && !order.stockCommitted && moving && moving !== 'draft'
              ? `${order.reference} will commit the stock on it. If any product is short, the server will refuse rather than drive stock negative.`
              : `${order?.reference ?? 'This order'} will move to ${moving ? orderStatusLabel(moving).toLowerCase() : 'the next status'}.`
        }
        confirmLabel={moving ? `Mark ${orderStatusLabel(moving).toLowerCase()}` : 'Move on'}
        cancelLabel="Leave it"
        busy={busy}
        onConfirm={confirmMove}
        onCancel={() => setMoving(null)}
      />

      <ConfirmDialog
        open={cancelling}
        title="Cancel this order?"
        message={
          order?.stockCommitted
            ? `${order.reference} will be cancelled and the stock it was holding put back. An order with payments against it cannot be cancelled — refunds are a separate instrument.`
            : `${order?.reference ?? 'This order'} will be cancelled. An order with payments against it cannot be cancelled.`
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        destructive
        busy={busy}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(false)}
      />

      <OrderPaymentDrawer
        order={paying}
        onClose={() => setPaying(null)}
        onRecorded={(result) => {
          setOrder(result.order);
          setPayments((current) => [result.payment, ...current]);
          onChanged();
        }}
      />

      <InstallmentPlanDrawer
        order={planning}
        onClose={() => setPlanning(null)}
        onSaved={(updated) => {
          setOrder(updated);
          onChanged();
        }}
      />
    </>
  );
}
