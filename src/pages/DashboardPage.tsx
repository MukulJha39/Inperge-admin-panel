import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { OrderStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  CATALOG_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  RELATIONSHIP_PERMISSIONS,
} from '../auth/permissions';
import { AreaChart, BarList, DonutChart, type BarRow } from '../components/Charts';
import { Chip } from '../components/Chip';
import {
  AccountIcon,
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  InboxIcon,
  MerchantsIcon,
  MoneyIcon,
  OrdersIcon,
  PulseIcon,
  RefreshIcon,
  RolesIcon,
  SortIcon,
} from '../components/Icon';
import { StatCard } from '../components/StatCard';
import { EmptyState, ErrorState, Skeleton } from '../components/States';
import {
  buildDayBuckets,
  compactMoneyMinor,
  compactNumber,
  greeting,
  type DonutInput,
} from '../utils/dashboardMath';
import { formatDateTime, formatMoneyMinor } from '../utils/format';
import { customerLabel, orderStatusLabel, orderStatusTone } from '../utils/orderFormat';
import { COLLECTION_WINDOW_DAYS, useDashboard } from '../utils/useDashboard';
import { useNow } from '../utils/useMotion';

/**
 * The overview an administrator lands on.
 *
 * It is a reading surface, not a working one: everything here either states a figure the
 * server counted or leads to the screen where the work is actually done. Sections the
 * signed-in role cannot see are absent rather than empty, which is also what the
 * navigation does (PRD section 26).
 */

/** Matches the ramp declared on `.dash` in dashboard.css. */
const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: 'var(--chart-draft)',
  confirmed: 'var(--chart-confirmed)',
  in_progress: 'var(--chart-progress)',
  ready: 'var(--chart-ready)',
  completed: 'var(--chart-completed)',
  cancelled: 'var(--chart-cancelled)',
  returned: 'var(--chart-returned)',
};

function stagger(index: number): CSSProperties {
  return { '--i': index } as CSSProperties;
}

function Panel({
  title,
  subtitle,
  action,
  children,
  flush = false,
  index = 0,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  index?: number;
}) {
  return (
    <section className="panel dash-rise" style={stagger(index)}>
      <div className="panel__header">
        <div className="grow">
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className={`panel__body${flush ? ' panel__body--flush' : ''}`}>{children}</div>
    </section>
  );
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="panel__link">
      {children}
      <ArrowRightIcon size={12} />
    </Link>
  );
}

function PanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="stack gap-4" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="stack gap-2">
          <Skeleton width={index % 2 === 0 ? '55%' : '42%'} height="12px" />
          <Skeleton height="7px" radius="999px" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { admin, can } = useAuth();
  const { data, loading, error, loadedAt, refresh, refreshing } = useDashboard();
  const now = useNow();

  const name = admin?.name ?? 'there';

  /* ---- collections: payments bucketed into the days they were settled on ---- */
  const collectionDays = useMemo(() => {
    if (!data.collections) return [];
    return buildDayBuckets(
      data.collections.entries.map((entry) => ({ at: entry.paidAt, amountMinor: entry.amountMinor })),
      COLLECTION_WINDOW_DAYS,
    );
  }, [data.collections]);

  const collectedMinor = collectionDays.reduce((sum, day) => sum + day.amountMinor, 0);

  const collectionSeries = useMemo(
    () =>
      collectionDays.map((day) => ({
        label: day.label,
        fullLabel: day.fullLabel,
        value: day.amountMinor,
      })),
    [collectionDays],
  );

  /* ---- the pipeline donut, from exact per-status counts ---- */
  const pipelineSlices: DonutInput[] = useMemo(() => {
    if (!data.orders) return [];
    return data.orders.byStatus
      .filter((entry) => entry.count > 0)
      .map((entry) => ({
        key: entry.status,
        label: orderStatusLabel(entry.status),
        value: entry.count,
        color: STATUS_COLORS[entry.status],
      }));
  }, [data.orders]);

  /* ---- who owes the most ---- */
  const outstandingRows: BarRow[] = useMemo(() => {
    if (!data.receivables) return [];
    return data.receivables.top.map((row) => ({
      key: row.merchantId,
      label: (
        <Link to={`/merchants/${row.merchantId}`} className="row-link">
          {row.merchantName ?? 'Unnamed merchant'}
        </Link>
      ),
      value: row.outstandingMinor,
      display: compactMoneyMinor(row.outstandingMinor),
      caption:
        row.overdueMinor > 0
          ? `${formatMoneyMinor(row.overdueMinor)} overdue across ${row.overdueOrders} order${row.overdueOrders === 1 ? '' : 's'}`
          : `${row.orderCount} open order${row.orderCount === 1 ? '' : 's'}`,
      tone: row.overdueMinor > 0 ? ('danger' as const) : ('brand' as const),
    }));
  }, [data.receivables]);

  const quickLinks = useMemo(
    () =>
      [
        { to: '/merchants', label: 'Merchants', icon: <MerchantsIcon size={16} />, allowed: can(PERMISSIONS.MERCHANT_VIEW) },
        { to: '/orders', label: 'Orders', icon: <OrdersIcon size={16} />, allowed: can(ORDER_PERMISSIONS.ORDER_VIEW) },
        { to: '/receivables', label: 'Receivables', icon: <MoneyIcon size={16} />, allowed: can(ORDER_PERMISSIONS.PAYMENT_VIEW) },
        { to: '/installments', label: 'Instalments', icon: <CalendarIcon size={16} />, allowed: can(ORDER_PERMISSIONS.INSTALLMENT_VIEW) },
        { to: '/low-stock', label: 'Needs attention', icon: <AlertIcon size={16} />, allowed: can(CATALOG_PERMISSIONS.STOCK_VIEW) },
        { to: '/customers', label: 'Customers', icon: <AccountIcon size={16} />, allowed: can(RELATIONSHIP_PERMISSIONS.CUSTOMER_VIEW) },
        { to: '/stock-activity', label: 'Stock activity', icon: <SortIcon size={16} />, allowed: can(CATALOG_PERMISSIONS.STOCK_VIEW) },
        { to: '/audit', label: 'Audit history', icon: <RolesIcon size={16} />, allowed: can(PERMISSIONS.AUDIT_VIEW) },
      ].filter((link) => link.allowed),
    [can],
  );

  if (error) {
    return (
      <div className="dash">
        <ErrorState message={error} onRetry={refresh} />
      </div>
    );
  }

  const hasAnySection =
    data.merchants !== null ||
    data.orders !== null ||
    data.receivables !== null ||
    data.lowStock !== null ||
    data.activity !== null;

  return (
    <div className="dash">
      {/* ------------------------------- hero ------------------------------- */}
      <header className="dash-hero dash-rise">
        <div className="dash-hero__inner">
          <div className="grow">
            <span className="dash-hero__eyebrow">
              <PulseIcon size={13} />
              Control centre
            </span>
            <h1 className="dash-hero__title">
              {greeting(now)}, {name}
            </h1>
            <p className="dash-hero__subtitle">
              Everything running on Inperge right now — the merchants, the money owed and
              the work still open.
            </p>
          </div>

          <div className="stack gap-3">
            <div className="dash-hero__meta">
              <span className="dash-hero__stamp">
                <span className="dash-pulse" aria-hidden="true" />
                {loadedAt ? `Updated · ${formatDateTime(loadedAt.toISOString())}` : 'Loading figures'}
              </span>
            </div>
            <button
              type="button"
              className={`dash-hero__action${refreshing ? ' dash-hero__action--spinning' : ''}`}
              onClick={refresh}
              disabled={loading || refreshing}
            >
              <RefreshIcon size={14} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* ----------------------------- headline ----------------------------- */}
      <div className="dash-stats">
        {data.merchants || loading ? (
          <StatCard
            index={0}
            label="Merchants"
            value={data.merchants?.total ?? 0}
            icon={<MerchantsIcon size={18} />}
            tone="brand"
            to="/merchants"
            linkLabel="View merchants"
            loading={loading}
            caption={
              <>
                <span className="stat__tag stat__tag--good">{data.merchants?.active ?? 0} active</span>
                {data.merchants && data.merchants.suspended > 0 ? (
                  <span className="stat__tag stat__tag--bad">{data.merchants.suspended} suspended</span>
                ) : null}
              </>
            }
          />
        ) : null}

        {data.orders || loading ? (
          <StatCard
            index={1}
            label="Orders"
            value={data.orders?.total ?? 0}
            icon={<OrdersIcon size={18} />}
            tone="info"
            to="/orders"
            linkLabel="View orders"
            loading={loading}
            caption={
              <>
                <span className="stat__tag">{data.orders?.open ?? 0} still open</span>
                {data.orders && data.orders.overdue > 0 ? (
                  <span className="stat__tag stat__tag--bad">{data.orders.overdue} overdue</span>
                ) : null}
              </>
            }
          />
        ) : null}

        {data.receivables || loading ? (
          <StatCard
            index={2}
            label="Outstanding"
            value={data.receivables?.outstandingMinor ?? 0}
            format={(value) => compactMoneyMinor(value)}
            exact={formatMoneyMinor(data.receivables?.outstandingMinor ?? 0)}
            icon={<MoneyIcon size={18} />}
            tone="warning"
            to="/receivables"
            linkLabel="View receivables"
            loading={loading}
            caption={
              data.receivables
                ? `Owed by ${data.receivables.merchantsOwing} merchant${data.receivables.merchantsOwing === 1 ? '' : 's'}`
                : undefined
            }
          />
        ) : null}

        {data.receivables || loading ? (
          <StatCard
            index={3}
            label="Overdue"
            value={data.receivables?.overdueMinor ?? 0}
            format={(value) => compactMoneyMinor(value)}
            exact={formatMoneyMinor(data.receivables?.overdueMinor ?? 0)}
            icon={<AlertIcon size={18} />}
            tone="danger"
            to="/receivables"
            linkLabel="Chase overdue"
            loading={loading}
            caption={
              data.overdueInstallments !== null
                ? `${data.overdueInstallments} instalment${data.overdueInstallments === 1 ? '' : 's'} past their date`
                : data.receivables
                  ? `${compactMoneyMinor(data.receivables.dueSoonMinor)} due soon`
                  : undefined
            }
          />
        ) : null}
      </div>

      {/* --------------------- collections and the pipeline -------------------- */}
      {data.collections || data.orders || loading ? (
        <div className="dash-split">
          {data.collections || loading ? (
            <Panel
              index={4}
              title="Collections"
              subtitle={`Money settled over the last ${COLLECTION_WINDOW_DAYS} days`}
              action={
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <span className="text-semibold text-numeric">{formatMoneyMinor(collectedMinor)}</span>
                  <span className="text-xs text-muted">
                    {data.collections?.windowTotal ?? 0} payment
                    {data.collections?.windowTotal === 1 ? '' : 's'}
                  </span>
                </div>
              }
            >
              {loading ? (
                <Skeleton height="180px" radius="var(--radius-md)" />
              ) : collectionSeries.length > 0 ? (
                <>
                  <AreaChart
                    points={collectionSeries}
                    formatValue={(value) => formatMoneyMinor(value)}
                    summary={`Money collected each day over the last ${COLLECTION_WINDOW_DAYS} days`}
                  />
                  {data.collections?.partial ? (
                    <p className="panel__note">
                      <AlertIcon size={13} />
                      <span>
                        {data.collections.windowTotal} payments fell in this window and the chart
                        reads the 100 most recent, so the earliest days are understated. The full
                        ledger is on <Link to="/payments">Payments</Link>.
                      </span>
                    </p>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="No payments yet"
                  message={`Nothing has been collected in the last ${COLLECTION_WINDOW_DAYS} days. Payments recorded by merchants or by an administrator appear here.`}
                  icon={<MoneyIcon size={20} />}
                />
              )}
            </Panel>
          ) : null}

          {data.orders || loading ? (
            <Panel
              index={5}
              title="Order pipeline"
              subtitle="Every order, by the state it is in"
              action={<PanelLink to="/orders">All orders</PanelLink>}
            >
              {loading ? (
                <PanelSkeleton lines={5} />
              ) : pipelineSlices.length > 0 ? (
                <DonutChart
                  slices={pipelineSlices}
                  centerValue={compactNumber(data.orders?.total ?? 0)}
                  centerLabel="orders"
                />
              ) : (
                <EmptyState
                  title="No orders yet"
                  message="Orders appear here as soon as a merchant records a sale in the app."
                  icon={<OrdersIcon size={20} />}
                />
              )}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* ------------------- who owes, and what needs attention ------------------ */}
      {data.receivables || data.lowStock || loading ? (
        <div className="dash-split dash-split--even">
          {data.receivables || loading ? (
            <Panel
              index={6}
              title="Largest balances"
              subtitle="Merchants with the most still to collect"
              action={<PanelLink to="/receivables">Receivables</PanelLink>}
            >
              {loading ? (
                <PanelSkeleton />
              ) : outstandingRows.length > 0 ? (
                <>
                  <BarList rows={outstandingRows} />
                  {data.receivables?.partial ? (
                    <p className="panel__note">
                      <AlertIcon size={13} />
                      <span>
                        {data.receivables.merchantsOwing} merchants have a balance and this reads the
                        first 100, so the totals above are a floor rather than the whole figure.
                      </span>
                    </p>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="Nothing outstanding"
                  message="Every order on the platform is settled. New balances appear here as merchants record unpaid sales."
                  icon={<MoneyIcon size={20} />}
                />
              )}
            </Panel>
          ) : null}

          {data.lowStock || loading ? (
            <Panel
              index={7}
              title="Needs attention"
              subtitle={
                data.lowStock
                  ? `${data.lowStock.total} product${data.lowStock.total === 1 ? '' : 's'} at or below their threshold`
                  : undefined
              }
              action={<PanelLink to="/low-stock">All alerts</PanelLink>}
              flush
            >
              {loading ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <PanelSkeleton />
                </div>
              ) : data.lowStock && data.lowStock.rows.length > 0 ? (
                <ul className="dash-list">
                  {data.lowStock.rows.map((row, index) => (
                    <li key={`${row.type}-${row.id}`} className="dash-list__item" style={stagger(index)}>
                      <span className="stat__icon stat__icon--warning" aria-hidden="true">
                        <InboxIcon size={16} />
                      </span>
                      <div className="dash-list__main">
                        <div className="dash-list__title truncate">{row.name}</div>
                        <div className="dash-list__meta truncate">
                          {row.merchantName ?? 'Unknown merchant'} · {row.type === 'item' ? 'Product' : 'Raw material'}
                        </div>
                      </div>
                      <div className="dash-list__value">
                        <Chip tone={row.isOutOfStock ? 'danger' : 'warning'} dot>
                          {row.isOutOfStock ? 'Out of stock' : `${row.quantity} left`}
                        </Chip>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Stock is healthy"
                  message="Nothing is at or below its low-stock threshold right now."
                  icon={<InboxIcon size={20} />}
                />
              )}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* --------------------- recent orders and activity --------------------- */}
      {data.recentOrders || data.activity || loading ? (
        <div className="dash-split dash-split--even">
          {data.recentOrders || loading ? (
            <Panel
              index={8}
              title="Latest orders"
              subtitle="The six most recently recorded"
              action={<PanelLink to="/orders">All orders</PanelLink>}
              flush
            >
              {loading ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <PanelSkeleton />
                </div>
              ) : data.recentOrders && data.recentOrders.length > 0 ? (
                <ul className="dash-list">
                  {data.recentOrders.map((order, index) => (
                    <li key={order.id} className="dash-list__item" style={stagger(index)}>
                      <div className="dash-list__main">
                        <div className="dash-list__title truncate">
                          <Link to={`/orders?search=${encodeURIComponent(order.reference)}`} className="row-link">
                            {order.reference}
                          </Link>
                        </div>
                        <div className="dash-list__meta truncate">
                          {customerLabel(order.customerName)}
                          {order.merchantName ? ` · ${order.merchantName}` : ''}
                        </div>
                      </div>
                      <div className="dash-list__value stack gap-1" style={{ alignItems: 'flex-end' }}>
                        <span>{formatMoneyMinor(order.totalMinor)}</span>
                        <Chip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</Chip>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No orders yet"
                  message="The most recent sales recorded across every merchant will be listed here."
                  icon={<OrdersIcon size={20} />}
                />
              )}
            </Panel>
          ) : null}

          {data.activity || loading ? (
            <Panel
              index={9}
              title="Recent activity"
              subtitle="What changed, and who changed it"
              action={<PanelLink to="/audit">Audit history</PanelLink>}
            >
              {loading ? (
                <PanelSkeleton lines={5} />
              ) : data.activity && data.activity.length > 0 ? (
                <ul className="feed">
                  {data.activity.map((entry, index) => (
                    <li key={entry.id} className="feed__item" style={stagger(index)}>
                      <span className="feed__rail" aria-hidden="true">
                        <span className="feed__dot" />
                      </span>
                      <div className="grow">
                        <div className="feed__summary">{entry.summary}</div>
                        <div className="feed__meta">
                          {entry.actorLabel} · <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                            {formatDateTime(entry.createdAt)}
                          </time>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Nothing recorded yet"
                  message="Every change made by an administrator, a merchant or the system is listed here as it happens."
                  icon={<ClockIcon size={20} />}
                />
              )}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------ shortcuts ------------------------------ */}
      {quickLinks.length > 0 ? (
        <nav className="quick-links" aria-label="Jump to a section">
          {quickLinks.map((link, index) => (
            <Link key={link.to} to={link.to} className="quick-link" style={stagger(index)}>
              <span className="quick-link__icon" aria-hidden="true">
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {!loading && !hasAnySection ? (
        <EmptyState
          title="Nothing to show here yet"
          message="Your role does not open any of the sections this overview summarises. Your own details are on the account screen."
          icon={<AccountIcon size={20} />}
        />
      ) : null}
    </div>
  );
}
