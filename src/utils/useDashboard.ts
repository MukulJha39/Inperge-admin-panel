import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminCustomers,
  fetchAdminInstallments,
  fetchAdminItems,
  fetchAdminLowStock,
  fetchAdminOrders,
  fetchAdminPayments,
  fetchAdminReceivables,
  fetchAuditLogs,
  fetchMerchants,
} from '../api/endpoints';
import type {
  AdminReceivable,
  AuditEntry,
  LowStockRow,
  Order,
  OrderStatus,
  PaymentEntry,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  CATALOG_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  RELATIONSHIP_PERMISSIONS,
} from '../auth/permissions';
import { windowStart } from './dashboardMath';

/**
 * The overview, assembled from the lists the admin API already exposes.
 *
 * There is no platform-wide summary endpoint, so every figure here is either a `total`
 * the server counted for a filtered list or a sum over rows the server returned — never
 * an estimate. Where a sum could be cut short by the API's 100-row page limit, the panel
 * says so: a total that is quietly partial is worse than one that admits it.
 *
 * Sections load independently. An administrator who cannot see payments still gets the
 * merchant counts, and one failing request leaves the rest of the page standing.
 */

/** The window the collections chart covers. */
export const COLLECTION_WINDOW_DAYS = 14;

/** The API caps a page at 100 rows; a sum over a list can reach no further. */
const PAGE_CAP = 100;

const PIPELINE_STATUSES: OrderStatus[] = [
  'draft',
  'confirmed',
  'in_progress',
  'ready',
  'completed',
  'cancelled',
  'returned',
];

export interface MerchantStats {
  total: number;
  active: number;
  suspended: number;
}

export interface OrderStats {
  total: number;
  open: number;
  overdue: number;
  byStatus: Array<{ status: OrderStatus; count: number }>;
}

export interface ReceivableStats {
  outstandingMinor: number;
  overdueMinor: number;
  dueSoonMinor: number;
  merchantsOwing: number;
  /** Highest outstanding first, already trimmed for display. */
  top: AdminReceivable[];
  /** True when more merchants owe than one page could carry, so the sums are a floor. */
  partial: boolean;
}

export interface CollectionStats {
  entries: PaymentEntry[];
  /** How many payments fell in the window, counted by the server. */
  windowTotal: number;
  /** True when the window holds more payments than one page could carry. */
  partial: boolean;
}

export interface LowStockStats {
  total: number;
  rows: LowStockRow[];
}

export interface DashboardData {
  merchants: MerchantStats | null;
  orders: OrderStats | null;
  receivables: ReceivableStats | null;
  collections: CollectionStats | null;
  overdueInstallments: number | null;
  lowStock: LowStockStats | null;
  customers: number | null;
  items: number | null;
  recentOrders: Order[] | null;
  activity: AuditEntry[] | null;
}

const EMPTY: DashboardData = {
  merchants: null,
  orders: null,
  receivables: null,
  collections: null,
  overdueInstallments: null,
  lowStock: null,
  customers: null,
  items: null,
  recentOrders: null,
  activity: null,
};

export interface DashboardState {
  data: DashboardData;
  loading: boolean;
  /** Set only when nothing at all could be loaded; a partial failure stays quiet. */
  error: string | null;
  /** When the figures on screen were read, so a stale tab is obvious. */
  loadedAt: Date | null;
  refresh: () => void;
  refreshing: boolean;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useDashboard(): DashboardState {
  const { can } = useAuth();

  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // What this role is allowed to see decides which requests are made at all.
  const scope = useMemo(
    () => ({
      merchants: can(PERMISSIONS.MERCHANT_VIEW),
      orders: can(ORDER_PERMISSIONS.ORDER_VIEW),
      payments: can(ORDER_PERMISSIONS.PAYMENT_VIEW),
      installments: can(ORDER_PERMISSIONS.INSTALLMENT_VIEW),
      stock: can(CATALOG_PERMISSIONS.STOCK_VIEW),
      items: can(CATALOG_PERMISSIONS.ITEM_VIEW),
      customers: can(RELATIONSHIP_PERMISSIONS.CUSTOMER_VIEW),
      audit: can(PERMISSIONS.AUDIT_VIEW),
    }),
    [can],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;

    // A count-only request: one row back, and only the server's total is read.
    const countOnly = { page: 1, limit: 1 };

    async function load() {
      setRefreshing((previous) => previous || loadedAt !== null);
      setError(null);

      const next: DashboardData = { ...EMPTY };
      let attempted = 0;
      let failed = 0;

      /** Runs one section, so a single failure cannot take the page down with it. */
      async function section(enabled: boolean, run: () => Promise<void>): Promise<void> {
        if (!enabled) return;
        attempted += 1;
        try {
          await run();
        } catch (sectionError) {
          if (isAbort(sectionError)) return;
          failed += 1;
        }
      }

      await Promise.all([
        section(scope.merchants, async () => {
          // Active and suspended are the only two states, so their counts are the total.
          const [active, suspended] = await Promise.all([
            fetchMerchants({ ...countOnly, status: 'active' }, signal),
            fetchMerchants({ ...countOnly, status: 'suspended' }, signal),
          ]);
          next.merchants = {
            active: active.meta.total,
            suspended: suspended.meta.total,
            total: active.meta.total + suspended.meta.total,
          };
        }),

        section(scope.orders, async () => {
          const [byStatus, open, overdue] = await Promise.all([
            Promise.all(
              PIPELINE_STATUSES.map(async (status) => ({
                status,
                count: (await fetchAdminOrders({ ...countOnly, status }, signal)).meta.total,
              })),
            ),
            fetchAdminOrders({ ...countOnly, open: true }, signal),
            fetchAdminOrders({ ...countOnly, overdue: true }, signal),
          ]);
          next.orders = {
            byStatus,
            // Every order is in exactly one status, so the parts are the whole.
            total: byStatus.reduce((sum, entry) => sum + entry.count, 0),
            open: open.meta.total,
            overdue: overdue.meta.total,
          };
        }),

        section(scope.orders, async () => {
          const recent = await fetchAdminOrders({ page: 1, limit: 6, sort: '-createdAt' }, signal);
          next.recentOrders = recent.items;
        }),

        section(scope.payments, async () => {
          const result = await fetchAdminReceivables({ page: 1, limit: PAGE_CAP }, signal);
          const rows = [...result.items].sort((a, b) => b.outstandingMinor - a.outstandingMinor);
          next.receivables = {
            outstandingMinor: rows.reduce((sum, row) => sum + row.outstandingMinor, 0),
            overdueMinor: rows.reduce((sum, row) => sum + row.overdueMinor, 0),
            dueSoonMinor: rows.reduce((sum, row) => sum + row.dueSoonMinor, 0),
            merchantsOwing: result.meta.total,
            top: rows.slice(0, 5),
            partial: result.meta.total > result.items.length,
          };
        }),

        section(scope.payments, async () => {
          const result = await fetchAdminPayments(
            { page: 1, limit: PAGE_CAP, sort: '-paidAt', from: windowStart(COLLECTION_WINDOW_DAYS) },
            signal,
          );
          next.collections = {
            entries: result.items,
            windowTotal: result.meta.total,
            partial: result.meta.total > result.items.length,
          };
        }),

        section(scope.installments, async () => {
          const result = await fetchAdminInstallments({ ...countOnly, overdue: true }, signal);
          next.overdueInstallments = result.meta.total;
        }),

        section(scope.stock, async () => {
          const result = await fetchAdminLowStock({ page: 1, limit: 5 }, signal);
          next.lowStock = { total: result.meta.total, rows: result.items };
        }),

        section(scope.customers, async () => {
          next.customers = (await fetchAdminCustomers(countOnly, signal)).meta.total;
        }),

        section(scope.items, async () => {
          next.items = (await fetchAdminItems(countOnly, signal)).meta.total;
        }),

        section(scope.audit, async () => {
          const result = await fetchAuditLogs({ page: 1, limit: 7 }, signal);
          next.activity = result.items;
        }),
      ]);

      if (cancelled || signal.aborted) return;

      setData(next);
      // Only a total blackout is reported as a page error; anything partial is shown.
      setError(
        attempted > 0 && failed === attempted
          ? 'Could not load the overview. Please try again.'
          : null,
      );
      setLoadedAt(new Date());
      setLoading(false);
      setRefreshing(false);
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `loadedAt` is read but deliberately not a dependency: it changes on every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, loading, error, loadedAt, refresh, refreshing };
}
