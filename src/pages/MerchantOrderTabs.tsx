import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  fetchAdminInstallments,
  fetchAdminOrders,
  fetchAdminPayments,
  fetchAdminReceivables,
  fetchMerchantOrderSummary,
} from '../api/endpoints';
import type {
  AdminInstallment,
  AdminReceivable,
  Order,
  OrderSummary,
  Paginated,
  PaymentEntry,
} from '../api/types';
import { Chip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { ErrorState, Skeleton } from '../components/States';
import { formatDate, formatDateTime, formatMoneyMinor } from '../utils/format';
import {
  customerLabel,
  installmentStatusLabel,
  installmentTone,
  orderStatusLabel,
  orderStatusTone,
} from '../utils/orderFormat';
import { paymentMethodLabel, paymentStateLabel, paymentStateTone } from '../utils/paymentFormat';
import { useCatalogList } from '../utils/useCatalogList';
import { OrderDetailPanel } from './OrderDetail';

/**
 * One merchant's orders, instalments, receivables and payments, inside their drill-down.
 *
 * Each panel is its own list scoped to the merchant, so a support conversation about one
 * business never involves scrolling a cross-merchant table.
 */

function Panel({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <section className="card" {...(caption ? { 'aria-label': caption } : {})}>
      {children}
    </section>
  );
}

export function MerchantOrdersPanel({ merchantId }: { merchantId: string }) {
  const [open, setOpen] = useState<string | null>(null);

  const list = useCatalogList<Order>(
    useCallback(
      (query, signal) => fetchAdminOrders(query, signal) as Promise<Paginated<Order>>,
      [],
    ),
    { merchantId, sort: '-orderDate' },
  );

  const columns: Column<Order>[] = [
    {
      key: 'reference',
      header: 'Order',
      grow: true,
      render: (order) => (
        <button type="button" className="row-link text-medium" onClick={() => setOpen(order.id)}>
          {order.reference}
        </button>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (order) => <span className="text-sm text-secondary">{customerLabel(order.customerName)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => (
        <Chip tone={orderStatusTone(order.status)} dot>
          {orderStatusLabel(order.status)}
        </Chip>
      ),
    },
    {
      key: 'totalMinor',
      header: 'Total',
      sortable: true,
      numeric: true,
      render: (order) => (
        <span className="text-numeric">{formatMoneyMinor(order.totalMinor)}</span>
      ),
    },
    {
      key: 'paymentState',
      header: 'Payment state',
      render: (order) => (
        <Chip tone={paymentStateTone(order.paymentState)} dot>
          {paymentStateLabel(order.paymentState)}
        </Chip>
      ),
    },
    {
      key: 'paidInstallments',
      header: 'Paid instalments',
      numeric: true,
      render: (order) => order.installments.filter((entry) => entry.status === 'paid').length || '—',
    },
    {
      key: 'totalInstallments',
      header: 'Total instalments',
      numeric: true,
      render: (order) => order.installments.length || '—',
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      numeric: true,
      render: (order) =>
        order.outstandingMinor > 0
          ? <span className="text-numeric text-medium">{formatMoneyMinor(order.outstandingMinor)}</span>
          : <span className="text-sm text-muted">Settled</span>,
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortable: true,
      render: (order) => <span className="text-sm text-secondary">{formatDate(order.dueDate)}</span>,
    },
    {
      key: 'orderDate',
      header: 'Ordered',
      sortable: true,
      render: (order) => (
        <span className="text-sm text-secondary">{formatDateTime(order.orderDate)}</span>
      ),
    },
  ];

  return (
    <>
      <Panel>
        <DataTable
          caption="Orders for this merchant"
          columns={columns}
          rows={list.rows}
          rowKey={(order) => order.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={{
            title: 'No orders yet',
            message: 'Orders appear here as soon as this merchant records a sale.',
          }}
        />
        {!list.loading && !list.error ? (
          <Pagination
            meta={list.meta}
            noun="Orders"
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        ) : null}
      </Panel>

      <OrderDetailPanel orderId={open} onClose={() => setOpen(null)} onChanged={() => list.reload()} />
    </>
  );
}

export function MerchantInstallmentsPanel({ merchantId }: { merchantId: string }) {
  const [open, setOpen] = useState<string | null>(null);

  const list = useCatalogList<AdminInstallment>(
    useCallback(
      (query, signal) =>
        fetchAdminInstallments(
          { merchantId, page: query.page, limit: query.limit },
          signal,
        ) as Promise<Paginated<AdminInstallment>>,
      [merchantId],
    ),
    { sort: '', rowId: (row) => `${row.orderId}:${row.number}` },
  );

  const columns: Column<AdminInstallment>[] = [
    {
      key: 'dueDate',
      header: 'Due',
      render: (row) => <span className="text-medium">{formatDate(row.dueDate)}</span>,
    },
    {
      key: 'reference',
      header: 'Order',
      grow: true,
      render: (row) => (
        <button type="button" className="row-link text-medium" onClick={() => setOpen(row.orderId)}>
          {row.reference}
        </button>
      ),
    },
    {
      key: 'number',
      header: 'Instalment',
      render: (row) => `#${row.number}`,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => <span className="text-sm text-secondary">{customerLabel(row.customerName)}</span>,
    },
    {
      key: 'amountMinor',
      header: 'Amount',
      numeric: true,
      render: (row) => <span className="text-numeric">{formatMoneyMinor(row.amountMinor)}</span>,
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      numeric: true,
      render: (row) => (
        <span className="text-numeric text-medium">{formatMoneyMinor(row.outstandingMinor)}</span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      render: (row) => (
        <Chip tone={installmentTone(row.status, row.isOverdue)} dot>
          {row.isOverdue ? 'Overdue' : installmentStatusLabel(row.status)}
        </Chip>
      ),
    },
  ];

  return (
    <>
      <Panel>
        <DataTable
          caption="Unpaid instalments for this merchant"
          columns={columns}
          rows={list.rows}
          rowKey={(row) => `${row.orderId}:${row.number}`}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={{
            title: 'No instalments are owed',
            message:
              'Instalments appear here as soon as this merchant sets a plan on an order.',
          }}
        />
        {!list.loading && !list.error ? (
          <Pagination
            meta={list.meta}
            noun="Instalments"
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        ) : null}
      </Panel>

      <OrderDetailPanel orderId={open} onClose={() => setOpen(null)} onChanged={() => list.reload()} />
    </>
  );
}

export function MerchantPaymentsPanel({ merchantId }: { merchantId: string }) {
  const list = useCatalogList<PaymentEntry>(
    useCallback(
      (query, signal) =>
        fetchAdminPayments(
          {
            merchantId,
            page: query.page,
            limit: query.limit,
            ...(query.sort ? { sort: query.sort } : {}),
          },
          signal,
        ) as Promise<Paginated<PaymentEntry>>,
      [merchantId],
    ),
    { sort: '-paidAt' },
  );

  const columns: Column<PaymentEntry>[] = [
    {
      key: 'paidAt',
      header: 'Paid',
      sortable: true,
      render: (entry) => <span className="text-medium">{formatDateTime(entry.paidAt)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (entry) => <span className="text-xs text-muted">{paymentMethodLabel(entry.method)}</span>,
    },
    {
      key: 'amountMinor',
      header: 'Amount',
      sortable: true,
      numeric: true,
      render: (entry) => <span className="text-numeric text-medium">{formatMoneyMinor(entry.amountMinor)}</span>,
    },
    {
      key: 'direction',
      header: 'Direction',
      render: (entry) => (
        <Chip tone={entry.direction === 'in' ? 'success' : 'neutral'}>
          {entry.direction === 'in' ? 'Received' : 'Paid out'}
        </Chip>
      ),
    },
    {
      key: 'payable',
      header: 'Against',
      grow: true,
      render: (entry) => <span className="text-medium">{entry.payableReference}</span>,
    },
    {
      key: 'payableType',
      header: 'Type',
      render: (entry) => entry.payableType === 'order' ? 'Order' : 'Purchase',
    },
    {
      key: 'installmentNumber',
      header: 'Instalment',
      render: (entry) => entry.installmentNumber ? `#${entry.installmentNumber}` : '—',
    },
    {
      key: 'balanceAfterMinor',
      header: 'Left after',
      numeric: true,
      render: (entry) => (
        <span className="text-numeric text-sm">{formatMoneyMinor(entry.balanceAfterMinor)}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Recorded by',
      render: (entry) =>
        entry.actorType === 'admin' ? (
          <Chip tone="info">{entry.actorLabel}</Chip>
        ) : (
          <span className="text-sm text-secondary">{entry.actorLabel}</span>
        ),
    },
  ];

  return (
    <Panel>
      <DataTable
        caption="Payment entries for this merchant"
        columns={columns}
        rows={list.rows}
        rowKey={(entry) => entry.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={{
          title: 'No payments yet',
          message: 'Entries appear here as soon as this merchant records a payment.',
        }}
      />
      {!list.loading && !list.error ? (
        <Pagination
          meta={list.meta}
          noun="Payments"
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
        />
      ) : null}
    </Panel>
  );
}

export function MerchantReceivablesPanel({ merchantId }: { merchantId: string }) {
  const list = useCatalogList<AdminReceivable>(
    useCallback(
      (query, signal) =>
        fetchAdminReceivables(
          { merchantId, page: query.page, limit: query.limit },
          signal,
        ) as Promise<Paginated<AdminReceivable>>,
      [merchantId],
    ),
    { sort: '', rowId: (row) => row.merchantId },
  );

  const columns: Column<AdminReceivable>[] = [
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      numeric: true,
      render: (row) => (
        <span className="text-numeric text-medium">{formatMoneyMinor(row.outstandingMinor)}</span>
      ),
    },
    {
      key: 'overdueMinor',
      header: 'Overdue',
      numeric: true,
      render: (row) =>
        row.overdueMinor > 0 ? (
          <span className="text-numeric text-medium">{formatMoneyMinor(row.overdueMinor)}</span>
        ) : (
          <span className="text-sm text-muted">Nothing late</span>
        ),
    },
    {
      key: 'overdueOrders',
      header: 'Overdue orders',
      numeric: true,
      render: (row) => row.overdueOrders || '—',
    },
    {
      key: 'dueSoonMinor',
      header: 'Due this week',
      numeric: true,
      render: (row) => (
        <span className="text-numeric text-sm">{formatMoneyMinor(row.dueSoonMinor)}</span>
      ),
    },
    {
      key: 'orderCount',
      header: 'Open orders',
      numeric: true,
      render: (row) => <span className="text-numeric text-sm">{row.orderCount}</span>,
    },
    {
      key: 'nextDueDate',
      header: 'Next due',
      render: (row) => <span className="text-sm text-secondary">{formatDate(row.nextDueDate)}</span>,
    },
  ];

  return (
    <Panel>
      <DataTable
        caption="Receivables for this merchant"
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.merchantId}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        empty={{
          title: 'Nothing is outstanding',
          message: 'Every order this merchant has written has been settled.',
        }}
      />
    </Panel>
  );
}

/**
 * The order figures at the top of a merchant's drill-down.
 *
 * Counted by the server from the merchant's own records, never estimated here: a support
 * screen that invents a number is worse than one that shows none.
 */
export function MerchantOrderSummaryCard({ merchantId }: { merchantId: string }) {
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchMerchantOrderSummary(merchantId, controller.signal);
        if (!cancelled) setSummary(result.summary);
      } catch (requestError) {
        if (
          cancelled ||
          (requestError instanceof DOMException && requestError.name === 'AbortError')
        ) {
          return;
        }
        setSummary(null);
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load this summary. Please try again.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [merchantId]);

  if (loading) {
    return (
      <section className="card">
        <div className="card__body stack gap-3">
          <Skeleton width="40%" height="14px" />
          <Skeleton width="70%" height="10px" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card">
        <div className="card__body">
          <ErrorState message={error} />
        </div>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <section className="card">
      <div className="card__header">
        <h3 className="card__title">Orders and money owed</h3>
      </div>
      <div className="card__body">
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-item__label">Orders</div>
            <div className="summary-item__value">{summary.orders.total}</div>
            <div className="summary-item__hint">
              {summary.orders.draft} draft · {summary.orders.completed} completed ·{' '}
              {summary.orders.cancelled} cancelled
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Sold</div>
            <div className="summary-item__value text-numeric">
              {formatMoneyMinor(summary.salesMinor)}
            </div>
            <div className="summary-item__hint">Excluding cancelled and returned orders</div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Outstanding</div>
            <div className="summary-item__value text-numeric">
              {formatMoneyMinor(summary.outstandingMinor)}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Overdue</div>
            <div className="summary-item__value text-numeric">
              {formatMoneyMinor(summary.overdueMinor)}
            </div>
            <div className="summary-item__hint">
              {summary.overdueOrders === 0
                ? 'Nothing is late'
                : `${summary.overdueOrders} order${summary.overdueOrders === 1 ? '' : 's'} past due`}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Instalments owed</div>
            <div className="summary-item__value">{summary.installments.pending}</div>
            <div className="summary-item__hint">
              {summary.installments.overdue === 0
                ? 'None overdue'
                : `${summary.installments.overdue} overdue`}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
