import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ORDER_PERMISSIONS } from '../auth/permissions';
import {
  fetchAdminInstallments,
  fetchAdminOrders,
  fetchAdminPayments,
  fetchAdminReceivables,
  fetchMerchants,
} from '../api/endpoints';
import type {
  AdminInstallment,
  AdminReceivable,
  Merchant,
  Order,
  Paginated,
  PaymentEntry,
} from '../api/types';
import { ActiveFilters } from '../components/ActiveFilters';
import { Chip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { SearchInput, SelectField } from '../components/Field';
import { formatDate, formatDateTime, formatMoneyMinor } from '../utils/format';
import {
  customerLabel,
  installmentStatusLabel,
  installmentTone,
  ORDER_STATUS_FILTER_OPTIONS,
  orderStatusLabel,
  orderStatusTone,
  formatDeliveryTime,
  hasDelivery,
} from '../utils/orderFormat';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_FILTER_OPTIONS,
  paymentMethodLabel,
  paymentStateLabel,
  paymentStateTone,
} from '../utils/paymentFormat';
import { useCatalogList } from '../utils/useCatalogList';
import { OrderDetailPanel } from './OrderDetail';
import { PaymentActions, PaymentDeleteDialog, PaymentEditDrawer } from './PaymentCorrection';

/** Links a row back to the merchant who owns it. */
function MerchantLink({
  merchantId,
  merchantName,
}: {
  merchantId?: string;
  merchantName?: string | null;
}) {
  if (!merchantId) return <span className="text-sm text-muted">—</span>;
  return (
    <Link to={`/merchants/${merchantId}`} className="row-link text-sm"
      title={merchantName ?? undefined}
    >
      {merchantName ?? 'View merchant'}
    </Link>
  );
}

/** Shows what is owed, and says plainly when nothing is. */
function OutstandingCell({ minor }: { minor: number }) {
  if (minor <= 0) return <span className="text-sm text-muted">Settled</span>;
  return <span className="text-numeric text-medium">{formatMoneyMinor(minor)}</span>;
}

/**
 * A from/to pair for narrowing a list to a period.
 *
 * Native date inputs rather than a picker component: an administrator typing a date is
 * faster than three taps, and the browser already localises the format.
 */
function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <>
      <label className="field">
        <span className="field__label">From</span>
        <input
          type="date"
          className="input"
          value={from}
          max={to || undefined}
          onChange={(event) => onFromChange(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">To</span>
        <input
          type="date"
          className="input"
          value={to}
          min={from || undefined}
          onChange={(event) => onToChange(event.target.value)}
        />
      </label>
    </>
  );
}

/** The end of a day, so a "to" date includes everything that happened on it. */
function endOfDay(value: string): string {
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}

function startOfDay(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

/**
 * Narrows a cross-merchant list to one business.
 *
 * Loaded once per mount rather than searched: an administrator picking a merchant from a
 * list is choosing among the businesses on the platform, and a type-ahead for that is a
 * worse experience than a list they can read. Capped, with a note when there are more, so
 * the control never silently omits someone.
 */
function MerchantFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const page = await fetchMerchants({ limit: 100, sort: 'firstName' }, controller.signal);
        if (cancelled) return;
        setMerchants(page.items);
        setTruncated(page.meta.total > page.items.length);
      } catch {
        // A filter that could not load is simply not offered; the list itself still works.
        if (!cancelled) setMerchants([]);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (merchants.length === 0) return null;

  return (
    <SelectField
      label="Merchant"
      value={value}
      hint={truncated ? 'Showing the first 100; drill into a merchant for the rest.' : undefined}
      options={[
        { value: '', label: 'All merchants' },
        ...merchants.map((merchant) => ({
          value: merchant.id,
          label: `${merchant.firstName} ${merchant.lastName}`.trim(),
        })),
      ]}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/* ---------------------------------- orders --------------------------------- */

export function OrdersPage() {
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [open, setOpen] = useState<Order | null>(null);

  // These filters are specific to orders, so the page owns them and folds them into the
  // query the shared hook builds.
  const fetcher = useCallback(
    (query: Parameters<typeof fetchAdminOrders>[0], signal: AbortSignal) =>
      fetchAdminOrders(
        {
          ...query,
          ...(status ? { status: status as Order['status'] } : {}),
          ...(paymentStatus ? { paymentStatus: paymentStatus as Order['paymentStatus'] } : {}),
          ...(overdueOnly ? { overdue: true } : {}),
          ...(openOnly ? { open: true } : {}),
          ...(from ? { from: startOfDay(from) } : {}),
          // To the end of the chosen day, so an order written that afternoon is included.
          ...(to ? { to: endOfDay(to) } : {}),
          ...(merchantId ? { merchantId } : {}),
        },
        signal,
      ) as Promise<Paginated<Order>>,
    [status, paymentStatus, overdueOnly, openOnly, from, to, merchantId],
  );

  // The filters this page owns are listed so the hook refetches when one of them moves.
  const orders = useCatalogList<Order>(fetcher, {
    sort: '-orderDate',
    deps: [status, paymentStatus, overdueOnly, openOnly, from, to, merchantId],
  });

  const columns: Column<Order>[] = [
    {
      key: 'reference',
      header: 'Order',
      grow: true,
      render: (order) => (
        <button type="button" className="row-link text-medium" onClick={() => setOpen(order)}>
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
      key: 'merchant',
      header: 'Merchant',
      render: (order) => (
        <MerchantLink
          {...(order.merchantId ? { merchantId: order.merchantId } : {})}
          merchantName={order.merchantName}
        />
      ),
    },
    {
      key: 'lines',
      header: 'Sold',
      render: (order) => (
        <span className="text-sm text-secondary">
          {order.lines.length === 1
            ? order.lines[0]!.name
            : `${order.lines.length} lines`}
        </span>
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
      key: 'outstandingMinor',
      header: 'Outstanding',
      numeric: true,
      render: (order) => <OutstandingCell minor={order.outstandingMinor} />,
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
      key: 'deliveryDate',
      header: 'Delivery',
      sortable: true,
      render: (order) =>
        hasDelivery(order) ? (
          <span className="stack" title={order.deliveryLocation ?? undefined}>
            <span className="text-sm">
              {formatDate(order.deliveryDate)}
              {order.deliveryTime ? ` · ${formatDeliveryTime(order.deliveryTime)}` : ''}
            </span>
            {order.deliveryLocation ? (
              <span className="text-xs text-secondary truncate">{order.deliveryLocation}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-secondary">—</span>
        ),
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

  const activeFilters = [
    ...orders.activeFilters,
    ...(status
      ? [{ label: `Status: ${orderStatusLabel(status)}`, clear: () => setStatus('') }]
      : []),
    ...(paymentStatus
      ? [
          {
            label: `Payment: ${paymentStateLabel(paymentStatus as Order['paymentState'])}`,
            clear: () => setPaymentStatus(''),
          },
        ]
      : []),
    ...(overdueOnly ? [{ label: 'Overdue only', clear: () => setOverdueOnly(false) }] : []),
    ...(openOnly ? [{ label: 'Still open', clear: () => setOpenOnly(false) }] : []),
    ...(from ? [{ label: `From ${from}`, clear: () => setFrom('') }] : []),
    ...(to ? [{ label: `To ${to}`, clear: () => setTo('') }] : []),
    ...(merchantId ? [{ label: 'One merchant', clear: () => setMerchantId('') }] : []),
  ];

  function clearAll() {
    orders.clearFilters();
    setStatus('');
    setPaymentStatus('');
    setOverdueOnly(false);
    setOpenOnly(false);
    setFrom('');
    setTo('');
    setMerchantId('');
  }

  return (
    <>
      <PageHeader
        title="Orders"
        description="What merchants sold, to whom, and whether it has been paid for."
        badge={orders.loading ? null : <Chip tone="brand">{orders.meta.total} total</Chip>}
      />

      <section className="card">
        <div className="toolbar">
          <SearchInput
            value={orders.search}
            onChange={orders.setSearch}
            label="Search orders"
            placeholder="Search by reference, customer or line"
          />

          <div className="toolbar__filters">
            <SelectField
              label="Status"
              value={status}
              options={ORDER_STATUS_FILTER_OPTIONS}
              onChange={(event) => setStatus(event.target.value)}
            />
            <SelectField
              label="Payment state"
              value={paymentStatus}
              options={PAYMENT_STATUS_FILTER_OPTIONS}
              onChange={(event) => setPaymentStatus(event.target.value)}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              <span>Overdue only</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(event) => setOpenOnly(event.target.checked)}
              />
              <span>Still open</span>
            </label>
            <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <MerchantFilter value={merchantId} onChange={setMerchantId} />
          </div>
        </div>

        <ActiveFilters filters={activeFilters} onClearAll={clearAll} />

        <DataTable
          caption="Orders across all merchants"
          columns={columns}
          rows={orders.rows}
          rowKey={(order) => order.id}
          loading={orders.loading}
          error={orders.error}
          onRetry={orders.reload}
          sort={orders.sort}
          onSortChange={orders.setSort}
          empty={{
            title: activeFilters.length > 0 ? 'No orders match these filters' : 'No orders yet',
            message:
              activeFilters.length > 0
                ? 'Try a different search term, or clear the filters.'
                : 'Orders appear here as soon as a merchant records a sale.',
            ...(activeFilters.length > 0
              ? { action: { label: 'Clear filters', onClick: clearAll } }
              : {}),
          }}
        />

        <Pagination meta={orders.meta} onPageChange={orders.setPage} />
      </section>

      <OrderDetailPanel
        orderId={open?.id ?? null}
        onClose={() => setOpen(null)}
        onChanged={() => orders.reload()}
      />
    </>
  );
}

/* -------------------------------- receivables ------------------------------ */

export function ReceivablesPage() {
  const [overdueOnly, setOverdueOnly] = useState(false);

  const fetcher = useCallback(
    (query: Parameters<typeof fetchAdminReceivables>[0], signal: AbortSignal) =>
      fetchAdminReceivables(
        { page: query.page, limit: query.limit, ...(overdueOnly ? { overdue: true } : {}) },
        signal,
      ) as Promise<Paginated<AdminReceivable>>,
    [overdueOnly],
  );

  const rows = useCatalogList<AdminReceivable>(fetcher, { sort: '', deps: [overdueOnly] });

  const columns: Column<AdminReceivable>[] = [
    {
      key: 'merchant',
      header: 'Merchant',
      grow: true,
      render: (row) => <MerchantLink merchantId={row.merchantId} merchantName={row.merchantName} />,
    },
    {
      key: 'orderCount',
      header: 'Open orders',
      numeric: true,
      render: (row) => <span className="text-numeric text-sm">{row.orderCount}</span>,
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      numeric: true,
      render: (row) => <OutstandingCell minor={row.outstandingMinor} />,
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
      render: (row) =>
        row.dueSoonMinor > 0 ? (
          <span className="text-numeric text-sm">{formatMoneyMinor(row.dueSoonMinor)}</span>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
    },
    {
      key: 'nextDueDate',
      header: 'Next due',
      render: (row) => <span className="text-sm text-secondary">{formatDate(row.nextDueDate)}</span>,
    },
    {
      key: 'orders',
      header: '',
      render: (row) => (
        <Link to={`/orders?merchant=${row.merchantId}`} className="row-link text-sm">
          View orders
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Receivables"
        description="What is owed to merchants, rolled up per merchant and worst first."
        badge={rows.loading ? null : <Chip tone="brand">{rows.meta.total} merchants</Chip>}
      />

      <section className="card">
        <div className="toolbar">
          <div className="toolbar__filters">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              <span>Overdue only</span>
            </label>
          </div>
        </div>

        <DataTable
          caption="Receivables per merchant"
          columns={columns}
          rows={rows.rows}
          rowKey={(row) => row.merchantId}
          loading={rows.loading}
          error={rows.error}
          onRetry={rows.reload}
          empty={{
            title: overdueOnly ? 'Nothing is overdue' : 'Nothing is outstanding',
            message: overdueOnly
              ? 'No merchant has an order past its due date.'
              : 'Every order across every merchant has been settled.',
          }}
        />

        <Pagination meta={rows.meta} onPageChange={rows.setPage} />
      </section>
    </>
  );
}

/* -------------------------------- instalments ------------------------------ */

export function InstallmentsPage() {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [horizon, setHorizon] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const fetcher = useCallback(
    (query: Parameters<typeof fetchAdminInstallments>[0], signal: AbortSignal) =>
      fetchAdminInstallments(
        {
          page: query.page,
          limit: query.limit,
          ...(overdueOnly ? { overdue: true } : {}),
          ...(horizon ? { withinDays: Number(horizon) } : {}),
        },
        signal,
      ) as Promise<Paginated<AdminInstallment>>,
    [overdueOnly, horizon],
  );

  const rows = useCatalogList<AdminInstallment>(fetcher, { sort: '', deps: [overdueOnly, horizon] });

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
      key: 'merchant',
      header: 'Merchant',
      render: (row) => <MerchantLink merchantId={row.merchantId} merchantName={row.merchantName} />,
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
      render: (row) => <OutstandingCell minor={row.outstandingMinor} />,
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

  const activeFilters = [
    ...(overdueOnly ? [{ label: 'Overdue only', clear: () => setOverdueOnly(false) }] : []),
    ...(horizon ? [{ label: `Within ${horizon} days`, clear: () => setHorizon('') }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Instalments"
        description="Every instalment still owed across every merchant, soonest first."
        badge={rows.loading ? null : <Chip tone="brand">{rows.meta.total} unpaid</Chip>}
      />

      <section className="card">
        <div className="toolbar">
          <div className="toolbar__filters">
            <SelectField
              label="Horizon"
              value={horizon}
              options={[
                { value: '', label: 'All unpaid' },
                { value: '7', label: 'Due within a week' },
                { value: '30', label: 'Due within a month' },
                { value: '90', label: 'Due within three months' },
              ]}
              onChange={(event) => setHorizon(event.target.value)}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              <span>Overdue only</span>
            </label>
          </div>
        </div>

        <ActiveFilters
          filters={activeFilters}
          onClearAll={() => {
            setOverdueOnly(false);
            setHorizon('');
          }}
        />

        <DataTable
          caption="Unpaid instalments across all merchants"
          columns={columns}
          rows={rows.rows}
          rowKey={(row) => `${row.orderId}:${row.number}`}
          loading={rows.loading}
          error={rows.error}
          onRetry={rows.reload}
          empty={{
            title: overdueOnly ? 'No instalment is overdue' : 'No instalments are owed',
            message: overdueOnly
              ? 'Every scheduled instalment is either paid or still ahead of its due date.'
              : 'Instalments appear here as soon as a merchant sets a plan on an order.',
          }}
        />

        <Pagination meta={rows.meta} onPageChange={rows.setPage} />
      </section>

      <OrderDetailPanel orderId={open} onClose={() => setOpen(null)} onChanged={() => rows.reload()} />
    </>
  );
}

/* --------------------------------- payments -------------------------------- */

export function PaymentsPage() {
  const [payableType, setPayableType] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [editing, setEditing] = useState<PaymentEntry | null>(null);
  const [deleting, setDeleting] = useState<PaymentEntry | null>(null);
  const { can } = useAuth();
  const canCorrect = can(ORDER_PERMISSIONS.PAYMENT_MANAGE);

  const fetcher = useCallback(
    (query: Parameters<typeof fetchAdminPayments>[0], signal: AbortSignal) =>
      fetchAdminPayments(
        {
          page: query.page,
          limit: query.limit,
          ...(query.sort ? { sort: query.sort } : {}),
          ...(payableType ? { payableType: payableType as PaymentEntry['payableType'] } : {}),
          ...(method ? { method: method as PaymentEntry['method'] } : {}),
          ...(from ? { from: startOfDay(from) } : {}),
          ...(to ? { to: endOfDay(to) } : {}),
          ...(merchantId ? { merchantId } : {}),
        },
        signal,
      ) as Promise<Paginated<PaymentEntry>>,
    [payableType, method, from, to, merchantId],
  );

  const payments = useCatalogList<PaymentEntry>(fetcher, {
    sort: '-paidAt',
    deps: [payableType, method, from, to, merchantId],
  });

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
      key: 'merchant',
      header: 'Merchant',
      render: (entry) => (
        <MerchantLink
          {...(entry.merchantId ? { merchantId: entry.merchantId } : {})}
          merchantName={entry.merchantName}
        />
      ),
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
      key: 'reference',
      header: 'Reference',
      render: (entry) => (
        entry.reference ? <span className="text-mono text-xs">{entry.reference}</span> : <span className="text-sm text-muted">—</span>
      ),
    },
    {
      key: 'recordedBy',
      header: 'Recorded by',
      render: (entry) =>
        entry.actorType === 'admin' ? <Chip tone="info">{entry.actorLabel}</Chip> : '—',
    },
    ...(canCorrect
      ? [
          {
            key: 'actions',
            header: '',
            render: (entry: PaymentEntry) => (
              <PaymentActions payment={entry} onEdit={setEditing} onDelete={setDeleting} />
            ),
          },
        ]
      : []),
  ];

  const activeFilters = [
    ...(payableType
      ? [
          {
            label: payableType === 'order' ? 'Orders only' : 'Purchases only',
            clear: () => setPayableType(''),
          },
        ]
      : []),
    ...(method ? [{ label: paymentMethodLabel(method), clear: () => setMethod('') }] : []),
    ...(from ? [{ label: `From ${from}`, clear: () => setFrom('') }] : []),
    ...(to ? [{ label: `To ${to}`, clear: () => setTo('') }] : []),
    ...(merchantId ? [{ label: 'One merchant', clear: () => setMerchantId('') }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every payment entry across every merchant. A payment entered wrong can be corrected or deleted; the order or purchase is recalculated and the change kept in the audit history."
        badge={payments.loading ? null : <Chip tone="brand">{payments.meta.total} entries</Chip>}
      />

      <section className="card">
        <div className="toolbar">
          <div className="toolbar__filters">
            <SelectField
              label="Against"
              value={payableType}
              options={[
                { value: '', label: 'Orders and purchases' },
                { value: 'order', label: 'Orders only' },
                { value: 'purchase', label: 'Purchases only' },
              ]}
              onChange={(event) => setPayableType(event.target.value)}
            />
            <SelectField
              label="Method"
              value={method}
              options={[{ value: '', label: 'Any method' }, ...PAYMENT_METHOD_OPTIONS]}
              onChange={(event) => setMethod(event.target.value)}
            />
            <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <MerchantFilter value={merchantId} onChange={setMerchantId} />
          </div>
        </div>

        <ActiveFilters
          filters={activeFilters}
          onClearAll={() => {
            setPayableType('');
            setMethod('');
            setFrom('');
            setTo('');
            setMerchantId('');
          }}
        />

        <DataTable
          caption="Payment entries across all merchants"
          columns={columns}
          rows={payments.rows}
          rowKey={(entry) => entry.id}
          loading={payments.loading}
          error={payments.error}
          onRetry={payments.reload}
          sort={payments.sort}
          onSortChange={payments.setSort}
          empty={{
            title: 'No payments yet',
            message: 'Entries appear here as soon as a merchant records a payment.',
          }}
        />

        <Pagination meta={payments.meta} onPageChange={payments.setPage} />
      </section>

      <PaymentEditDrawer payment={editing} onClose={() => setEditing(null)} onSaved={payments.reload} />
      <PaymentDeleteDialog payment={deleting} onClose={() => setDeleting(null)} onDeleted={payments.reload} />
    </>
  );
}
