import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  fetchAdminCustomers,
  fetchAdminPurchases,
  fetchAdminSuppliers,
  setAdminCustomerArchived,
  setAdminSupplierArchived,
} from '../api/endpoints';
import type { Customer, Paginated, Purchase, Supplier } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { RELATIONSHIP_PERMISSIONS } from '../auth/permissions';
import { IconButton } from '../components/Button';
import { ActiveFilters } from '../components/ActiveFilters';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { EditIcon, ShieldOffIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { SearchInput, SelectField } from '../components/Field';
import { useToast } from '../components/Toast';
import { formatDate, formatDateTime, formatMoneyMinor, formatPhone } from '../utils/format';
import {
  contactChannelLabel,
  PAYMENT_STATUS_FILTER_OPTIONS,
  paymentStateLabel,
  paymentStateTone,
} from '../utils/paymentFormat';
import { useCatalogList } from '../utils/useCatalogList';
import { PurchaseDetailPanel } from './PurchaseDetail';
import { CustomerDrawer, SupplierDrawer } from './RelationshipDrawers';

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

function ArchivedChip({ archived }: { archived: boolean }) {
  if (!archived) return null;
  return (
    <Chip tone="neutral" dot>
      Archived
    </Chip>
  );
}

/** Shows what is owed, and says plainly when nothing is. */
function OutstandingCell({ minor }: { minor: number }) {
  if (minor <= 0) return <span className="text-sm text-muted">Settled</span>;
  return <span className="text-numeric text-medium">{formatMoneyMinor(minor)}</span>;
}

/**
 * The filter row shared by the relationship tables.
 *
 * Separate from CatalogToolbar because these lists filter on who owes money rather
 * than on stock, and a single toolbar trying to serve both would carry props that are
 * meaningless half the time.
 */
function RelationshipToolbar({
  search,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  archived,
  outstanding,
  outstandingLabel,
  activeFilters,
  onClearFilters,
  extra,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** Omitted where a list has no archive state, such as purchases. */
  archived?: { value: boolean; onChange: (value: boolean) => void };
  outstanding?: { value: boolean; onChange: (value: boolean) => void };
  outstandingLabel?: string;
  activeFilters: { label: string; clear: () => void }[];
  onClearFilters: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <div className="toolbar">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          label={searchLabel}
          placeholder={searchPlaceholder}
        />

        <div className="toolbar__filters">
          {archived ? (
            <>
              <label className="sr-only" htmlFor="filter-archived">
                Show archived
              </label>
              <select
                id="filter-archived"
                className="select"
                value={archived.value ? 'archived' : 'active'}
                onChange={(event) => archived.onChange(event.target.value === 'archived')}
              >
                <option value="active">Active records</option>
                <option value="archived">Archived records</option>
              </select>
            </>
          ) : null}

          {outstanding ? (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={outstanding.value}
                onChange={(event) => outstanding.onChange(event.target.checked)}
              />
              <span>{outstandingLabel ?? 'Owes money only'}</span>
            </label>
          ) : null}

          {extra}
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <ActiveFilters filters={activeFilters} onClearAll={onClearFilters} />
      ) : null}
    </>
  );
}

/* -------------------------------- customers ------------------------------- */

export function CustomersPage() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useCatalogList<Customer>(
    useCallback(
      (query, signal) => fetchAdminCustomers(query, signal) as Promise<Paginated<Customer>>,
      [],
    ),
    { sort: '-createdAt' },
  );

  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiving, setArchiving] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = can(RELATIONSHIP_PERMISSIONS.CUSTOMER_EDIT);
  const canArchive = can(RELATIONSHIP_PERMISSIONS.CUSTOMER_ARCHIVE);

  async function confirmArchive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const result = await setAdminCustomerArchived(archiving.id, !archiving.archived);
      toast.success(
        archiving.archived ? 'Customer restored' : 'Customer archived',
        `${result.customer.fullName} keeps their order and payment history either way.`,
      );
      list.reload();
      setArchiving(null);
    } catch (error) {
      toast.error(
        'Could not update the customer',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Customer>[] = [
    {
      key: 'firstName',
      header: 'Customer',
      grow: true,
      sortable: true,
      render: (customer) => <span className="text-medium truncate">{customer.fullName}</span>,
    },
    {
      key: 'companyName',
      header: 'Company',
      render: (customer) => customer.companyName ?? '—',
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (customer) =>
        customer.tags.length > 0
          ? customer.tags.map((tag) => <Chip key={tag} tone="info">{tag}</Chip>)
          : '—',
    },
    {
      key: 'archived',
      header: 'Status',
      render: (customer) => customer.archived ? <ArchivedChip archived /> : 'Active',
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
      key: 'merchant',
      header: 'Merchant',
      render: (customer) => (
        <MerchantLink
          {...(customer.merchantId ? { merchantId: customer.merchantId } : {})}
          merchantName={customer.merchantName}
        />
      ),
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      sortable: true,
      numeric: true,
      render: (customer) => <OutstandingCell minor={customer.outstandingMinor} />,
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
    {
      key: 'createdAt',
      header: 'Added',
      sortable: true,
      render: (customer) => (
        <span className="text-sm text-secondary">{formatDateTime(customer.createdAt)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="The people merchants sell to. Archiving one hides them from pickers; it never touches their history."
        badge={list.loading ? null : <Chip tone="brand">{list.meta.total} total</Chip>}
      />

      <section className="card">
        <RelationshipToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchLabel="Search customers"
          searchPlaceholder="Search by name, phone or company"
          archived={{ value: list.archived, onChange: list.setArchived }}
          outstanding={{ value: list.outstanding, onChange: list.setOutstanding }}
          activeFilters={list.activeFilters}
          onClearFilters={list.clearFilters}
        />

        <DataTable
          caption="Customers across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(customer) => customer.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={{
            title:
              list.activeFilters.length > 0 ? 'No customers match these filters' : 'No customers yet',
            message:
              list.activeFilters.length > 0
                ? 'Try a different search term, or clear the filters.'
                : 'Customers appear here as soon as a merchant adds one.',
            ...(list.activeFilters.length > 0
              ? { action: { label: 'Clear filters', onClick: list.clearFilters } }
              : {}),
          }}
          {...(canEdit || canArchive
            ? {
                rowActions: (customer: Customer) => (
                  <>
                    {canEdit ? (
                      <IconButton
                        label={`Edit ${customer.fullName}`}
                        icon={<EditIcon />}
                        onClick={() => setEditing(customer)}
                      />
                    ) : null}
                    {canArchive ? (
                      <IconButton
                        label={`${customer.archived ? 'Restore' : 'Archive'} ${customer.fullName}`}
                        icon={<ShieldOffIcon />}
                        onClick={() => setArchiving(customer)}
                      />
                    ) : null}
                  </>
                ),
              }
            : {})}
        />

        <Pagination meta={list.meta} onPageChange={list.setPage} />
      </section>

      <CustomerDrawer
        customer={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => list.applyRow(updated)}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving?.archived ? 'Restore this customer?' : 'Archive this customer?'}
        message={
          archiving?.archived
            ? `${archiving.fullName} will appear in the merchant's lists and pickers again.`
            : `${archiving?.fullName ?? 'This customer'} leaves the merchant's lists. Their orders and payments are untouched, and you can restore them at any time.`
        }
        confirmLabel={archiving?.archived ? 'Restore customer' : 'Archive customer'}
        busy={busy}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </>
  );
}

/* -------------------------------- suppliers ------------------------------- */

export function SuppliersPage() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useCatalogList<Supplier>(
    useCallback(
      (query, signal) => fetchAdminSuppliers(query, signal) as Promise<Paginated<Supplier>>,
      [],
    ),
    { sort: '-createdAt' },
  );

  const [editing, setEditing] = useState<Supplier | null>(null);
  const [archiving, setArchiving] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = can(RELATIONSHIP_PERMISSIONS.SUPPLIER_MANAGE);

  async function confirmArchive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const result = await setAdminSupplierArchived(archiving.id, !archiving.archived);
      toast.success(
        archiving.archived ? 'Supplier restored' : 'Supplier archived',
        `${result.supplier.name} keeps their purchase history either way.`,
      );
      list.reload();
      setArchiving(null);
    } catch (error) {
      // The server refuses to archive a supplier who is still owed money, and says so.
      toast.error(
        'Could not update the supplier',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      grow: true,
      sortable: true,
      render: (supplier) => <span className="text-medium truncate">{supplier.name}</span>,
    },
    {
      key: 'contactPerson',
      header: 'Contact person',
      render: (supplier) => supplier.contactPerson ?? '—',
    },
    {
      key: 'archived',
      header: 'Status',
      render: (supplier) => supplier.archived ? <ArchivedChip archived /> : 'Active',
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
      key: 'merchant',
      header: 'Merchant',
      render: (supplier) => (
        <MerchantLink
          {...(supplier.merchantId ? { merchantId: supplier.merchantId } : {})}
          merchantName={supplier.merchantName}
        />
      ),
    },
    {
      key: 'outstandingMinor',
      header: 'Owed',
      sortable: true,
      numeric: true,
      render: (supplier) => <OutstandingCell minor={supplier.outstandingMinor} />,
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
    <>
      <PageHeader
        title="Suppliers"
        description="Who merchants buy from, and what is still owed to them."
        badge={list.loading ? null : <Chip tone="brand">{list.meta.total} total</Chip>}
      />

      <section className="card">
        <RelationshipToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchLabel="Search suppliers"
          searchPlaceholder="Search by name, contact or phone"
          archived={{ value: list.archived, onChange: list.setArchived }}
          outstanding={{ value: list.outstanding, onChange: list.setOutstanding }}
          outstandingLabel="Still owed only"
          activeFilters={list.activeFilters}
          onClearFilters={list.clearFilters}
        />

        <DataTable
          caption="Suppliers across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(supplier) => supplier.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={{
            title:
              list.activeFilters.length > 0 ? 'No suppliers match these filters' : 'No suppliers yet',
            message:
              list.activeFilters.length > 0
                ? 'Try a different search term, or clear the filters.'
                : 'Suppliers appear here as soon as a merchant records a purchase.',
            ...(list.activeFilters.length > 0
              ? { action: { label: 'Clear filters', onClick: list.clearFilters } }
              : {}),
          }}
          {...(canManage
            ? {
                rowActions: (supplier: Supplier) => (
                  <>
                    <IconButton
                      label={`Edit ${supplier.name}`}
                      icon={<EditIcon />}
                      onClick={() => setEditing(supplier)}
                    />
                    <IconButton
                      label={`${supplier.archived ? 'Restore' : 'Archive'} ${supplier.name}`}
                      icon={<ShieldOffIcon />}
                      onClick={() => setArchiving(supplier)}
                    />
                  </>
                ),
              }
            : {})}
        />

        <Pagination meta={list.meta} onPageChange={list.setPage} />
      </section>

      <SupplierDrawer
        supplier={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => list.applyRow(updated)}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving?.archived ? 'Restore this supplier?' : 'Archive this supplier?'}
        message={
          archiving?.archived
            ? `${archiving.name} will appear in the merchant's pickers again.`
            : `${archiving?.name ?? 'This supplier'} leaves the merchant's pickers. Their purchases are untouched. A supplier who is still owed money cannot be archived.`
        }
        confirmLabel={archiving?.archived ? 'Restore supplier' : 'Archive supplier'}
        busy={busy}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </>
  );
}

/* -------------------------------- purchases ------------------------------- */

export function PurchasesPage() {
  const [paymentStatus, setPaymentStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [open, setOpen] = useState<Purchase | null>(null);

  // These two filters are specific to purchases, so the page owns them and folds them
  // into the query the shared hook builds.
  const fetcher = useCallback(
    (query: Parameters<typeof fetchAdminPurchases>[0], signal: AbortSignal) =>
      fetchAdminPurchases(
        {
          ...query,
          ...(paymentStatus ? { paymentStatus: paymentStatus as Purchase['paymentStatus'] } : {}),
          ...(overdueOnly ? { overdue: true } : {}),
        },
        signal,
      ) as Promise<Paginated<Purchase>>,
    [paymentStatus, overdueOnly],
  );

  const purchases = useCatalogList<Purchase>(fetcher, {
    sort: '-purchaseDate',
    deps: [paymentStatus, overdueOnly],
  });

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
          <Chip tone="warning" dot>Awaiting</Chip>
        ),
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (purchase) => (
        <MerchantLink
          {...(purchase.merchantId ? { merchantId: purchase.merchantId } : {})}
          merchantName={purchase.merchantName}
        />
      ),
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
      header: 'Payment state',
      render: (purchase) => (
        <Chip tone={paymentStateTone(purchase.paymentState)} dot>
          {paymentStateLabel(purchase.paymentState)}
        </Chip>
      ),
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      numeric: true,
      render: (purchase) => <OutstandingCell minor={purchase.outstandingMinor} />,
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortable: true,
      render: (purchase) => (
        <span className="text-sm text-secondary">{formatDate(purchase.dueDate)}</span>
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
      <PageHeader
        title="Purchases"
        description="What merchants bought, from whom, and whether it has been paid for."
        badge={purchases.loading ? null : <Chip tone="brand">{purchases.meta.total} total</Chip>}
      />

      <section className="card">
        <RelationshipToolbar
          search={purchases.search}
          onSearchChange={purchases.setSearch}
          searchLabel="Search purchases"
          searchPlaceholder="Search by reference, supplier or line"
          activeFilters={[
            ...purchases.activeFilters,
            ...(paymentStatus
              ? [
                  {
                    label: `Payment: ${paymentStateLabel(paymentStatus as Purchase['paymentState'])}`,
                    clear: () => setPaymentStatus(''),
                  },
                ]
              : []),
            ...(overdueOnly ? [{ label: 'Overdue only', clear: () => setOverdueOnly(false) }] : []),
          ]}
          onClearFilters={() => {
            purchases.clearFilters();
            setPaymentStatus('');
            setOverdueOnly(false);
          }}
          outstanding={{ value: overdueOnly, onChange: setOverdueOnly }}
          outstandingLabel="Overdue only"
          extra={
            <SelectField
              label="Payment state"
              value={paymentStatus}
              options={PAYMENT_STATUS_FILTER_OPTIONS}
              onChange={(event) => setPaymentStatus(event.target.value)}
            />
          }
        />

        <DataTable
          caption="Purchases across all merchants"
          columns={columns}
          rows={purchases.rows}
          rowKey={(purchase) => purchase.id}
          loading={purchases.loading}
          error={purchases.error}
          onRetry={purchases.reload}
          sort={purchases.sort}
          onSortChange={purchases.setSort}
          empty={{
            title: 'No purchases yet',
            message: 'Purchases appear here as soon as a merchant records one.',
          }}
        />

        <Pagination meta={purchases.meta} onPageChange={purchases.setPage} />
      </section>

      <PurchaseDetailPanel
        purchaseId={open?.id ?? null}
        onClose={() => setOpen(null)}
        onChanged={() => purchases.reload()}
      />
    </>
  );
}
