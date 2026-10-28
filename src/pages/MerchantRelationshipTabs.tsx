import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import {
  fetchAdminCustomers,
  fetchAdminPurchases,
  fetchAdminSuppliers,
  fetchMerchantRelationshipSummary,
} from '../api/endpoints';
import type {
  Customer,
  Paginated,
  Purchase,
  RelationshipSummary,
  Supplier,
} from '../api/types';
import { Chip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { ErrorState, Skeleton } from '../components/States';
import { formatDateTime, formatMoneyMinor, formatPhone } from '../utils/format';
import { contactChannelLabel, paymentStateLabel, paymentStateTone } from '../utils/paymentFormat';
import { useCatalogList } from '../utils/useCatalogList';
import { PurchaseDetailPanel } from './PurchaseDetail';

/**
 * One merchant's customers, suppliers and purchases, inside their drill-down.
 *
 * Each panel is its own list scoped to the merchant, so a support conversation about
 * one business never involves scrolling a cross-merchant table.
 */

function Panel<T extends { id: string }>({
  columns,
  list,
  noun,
  emptyTitle,
  emptyMessage,
}: {
  columns: Column<T>[];
  list: ReturnType<typeof useCatalogList<T>>;
  noun: string;
  emptyTitle: string;
  emptyMessage: string;
}) {
  return (
    <section className="card">
      <DataTable
        caption={`${noun} for this merchant`}
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        sort={list.sort}
        onSortChange={list.setSort}
        empty={{ title: emptyTitle, message: emptyMessage }}
      />
      {!list.loading && !list.error ? (
        <Pagination
          meta={list.meta}
          noun={noun}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
        />
      ) : null}
    </section>
  );
}

export function MerchantCustomersPanel({ merchantId }: { merchantId: string }) {
  const list = useCatalogList<Customer>(
    useCallback(
      (query, signal) => fetchAdminCustomers(query, signal) as Promise<Paginated<Customer>>,
      [],
    ),
    { merchantId, sort: 'firstName' },
  );

  const columns: Column<Customer>[] = [
    {
      key: 'firstName',
      header: 'Customer',
      grow: true,
      sortable: true,
      render: (customer) => <span className="text-medium truncate">{customer.fullName}</span>,
    },
    {
      key: 'phone',
      header: 'Mobile number',
      render: (customer) => (
        <span className="text-mono text-sm">
          {formatPhone(customer.countryCode, customer.phone)}
        </span>
      ),
    },
    {
      key: 'company',
      header: 'Business',
      render: (customer) => (
        <span className="text-sm text-secondary">{customer.companyName ?? '—'}</span>
      ),
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      sortable: true,
      numeric: true,
      render: (customer) =>
        customer.outstandingMinor > 0 ? (
          <span className="text-numeric">{formatMoneyMinor(customer.outstandingMinor)}</span>
        ) : (
          <span className="text-sm text-muted">Settled</span>
        ),
    },
    {
      key: 'channel',
      header: 'Reachable by',
      render: (customer) => (
        <span className="text-sm text-secondary">
          {contactChannelLabel(customer.preferredChannel)}
        </span>
      ),
    },
  ];

  return (
    <Panel
      columns={columns}
      list={list}
      noun="customers"
      emptyTitle="No customers yet"
      emptyMessage="This merchant has not added anyone they sell to."
    />
  );
}

export function MerchantSuppliersPanel({ merchantId }: { merchantId: string }) {
  const list = useCatalogList<Supplier>(
    useCallback(
      (query, signal) => fetchAdminSuppliers(query, signal) as Promise<Paginated<Supplier>>,
      [],
    ),
    { merchantId, sort: 'name' },
  );

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      grow: true,
      sortable: true,
      render: (supplier) => <span className="text-medium truncate">{supplier.name}</span>,
    },
    {
      key: 'phone',
      header: 'Mobile number',
      render: (supplier) =>
        supplier.phone ? (
          <span className="text-mono text-sm">
            {formatPhone(supplier.countryCode ?? '', supplier.phone)}
          </span>
        ) : (
          <span className="text-sm text-muted">—</span>
        ),
    },
    {
      key: 'outstandingMinor',
      header: 'Owed',
      sortable: true,
      numeric: true,
      render: (supplier) =>
        supplier.outstandingMinor > 0 ? (
          <span className="text-numeric">{formatMoneyMinor(supplier.outstandingMinor)}</span>
        ) : (
          <span className="text-sm text-muted">Settled</span>
        ),
    },
    {
      key: 'purchases',
      header: 'Purchase count',
      numeric: true,
      render: (supplier) => <span className="text-sm text-secondary text-numeric">{supplier.purchaseCount}</span>,
    },
    {
      key: 'totalPurchasedMinor',
      header: 'Total purchased',
      numeric: true,
      render: (supplier) => <span className="text-sm text-secondary text-numeric">{formatMoneyMinor(supplier.totalPurchasedMinor)}</span>,
    },
    {
      key: 'lastPurchaseAt',
      header: 'Last purchase',
      sortable: true,
      render: (supplier) => (
        <span className="text-sm text-secondary">{formatDateTime(supplier.lastPurchaseAt)}</span>
      ),
    },
  ];

  return (
    <Panel
      columns={columns}
      list={list}
      noun="suppliers"
      emptyTitle="No suppliers yet"
      emptyMessage="This merchant has not recorded a purchase."
    />
  );
}

export function MerchantPurchasesPanel({ merchantId }: { merchantId: string }) {
  const list = useCatalogList<Purchase>(
    useCallback(
      (query, signal) => fetchAdminPurchases(query, signal) as Promise<Paginated<Purchase>>,
      [],
    ),
    { merchantId, sort: '-purchaseDate' },
  );

  const [open, setOpen] = useState<Purchase | null>(null);

  const columns: Column<Purchase>[] = [
    {
      key: 'reference',
      header: 'Purchase',
      grow: true,
      render: (purchase) => (
        <button type="button" className="row-link text-medium" onClick={() => setOpen(purchase)}>
          {purchase.reference}
        </button>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (purchase) => <span className="text-sm text-secondary">{purchase.supplierName}</span>,
    },
    {
      key: 'totalMinor',
      header: 'Total',
      sortable: true,
      numeric: true,
      render: (purchase) => (
        <span className="text-numeric">{formatMoneyMinor(purchase.totalMinor)}</span>
      ),
    },
    {
      key: 'paymentState',
      header: 'Payment',
      render: (purchase) => (
        <Chip tone={paymentStateTone(purchase.paymentState)} dot>
          {paymentStateLabel(purchase.paymentState)}
        </Chip>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (purchase) => purchase.status === 'cancelled' ? (
        <Chip tone="neutral" dot>Cancelled</Chip>
      ) : <span className="text-sm text-secondary">Recorded</span>,
    },
    {
      key: 'received',
      header: 'Stock received',
      render: (purchase) =>
        purchase.status === 'cancelled' ? '—' : purchase.received ? (
          <span className="text-sm text-secondary">Received</span>
        ) : (
          <Chip tone="warning" dot>
            Awaiting
          </Chip>
        ),
    },
    {
      key: 'purchaseDate',
      header: 'Purchased',
      sortable: true,
      render: (purchase) => (
        <span className="text-sm text-secondary">{formatDateTime(purchase.purchaseDate)}</span>
      ),
    },
  ];

  return (
    <>
      <Panel
        columns={columns}
        list={list}
        noun="purchases"
        emptyTitle="No purchases yet"
        emptyMessage="This merchant has not recorded anything they bought."
      />
      <PurchaseDetailPanel
        purchaseId={open?.id ?? null}
        onClose={() => setOpen(null)}
        onChanged={() => list.reload()}
      />
    </>
  );
}

/**
 * The counts behind the drill-down tabs, and what this merchant owes their suppliers.
 *
 * Shown above the tabs so an administrator opening a support conversation sees the
 * shape of the business before choosing where to look.
 */
export function MerchantRelationshipSummaryCard({ merchantId }: { merchantId: string }) {
  const [summary, setSummary] = useState<RelationshipSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchMerchantRelationshipSummary(merchantId, controller.signal);
        if (!cancelled) setSummary(result.summary);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
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
        <h3 className="card__title">Relationships</h3>
      </div>
      <div className="card__body">
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-item__label">Customers</div>
            <div className="summary-item__value">{summary.customers.active}</div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Suppliers</div>
            <div className="summary-item__value">{summary.suppliers.active}</div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Purchases</div>
            <div className="summary-item__value">{summary.purchases.recorded}</div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Awaiting stock</div>
            <div className="summary-item__value">{summary.purchases.awaitingStock}</div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Overdue purchases</div>
            <div className="summary-item__value">
              {summary.purchases.overdue > 0 ? (
                <Chip tone="danger" dot>
                  {summary.purchases.overdue}
                </Chip>
              ) : (
                '0'
              )}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-item__label">Owed to suppliers</div>
            <div className="summary-item__value text-numeric">
              {formatMoneyMinor(summary.outstandingPayableMinor)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
