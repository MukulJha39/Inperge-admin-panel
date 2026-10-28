import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  fetchAdminItems,
  fetchAdminLowStock,
  fetchAdminMaterials,
  fetchAdminServices,
  fetchAdminStockMovements,
  setAdminItemArchived,
  setAdminMaterialArchived,
  setAdminServiceArchived,
} from '../api/endpoints';
import type {
  CatalogItem,
  CatalogMaterial,
  CatalogService,
  LowStockRow,
  Paginated,
  StockMovement,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CATALOG_PERMISSIONS } from '../auth/permissions';
import { IconButton } from '../components/Button';
import { CatalogToolbar, StockCell, StockStatusCell } from '../components/CatalogToolbar';
import { CatalogDeleteDialog, type DeletableRecord } from './CatalogDeleteDialog';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { EditIcon, ShieldOffIcon, SortIcon, TrashIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';
import {
  billingUnitLabel,
  formatDate,
  formatDateTime,
  formatDelta,
  formatMoneyMinor,
  formatQuantity,
  movementTypeLabel,
  stockReasonLabel,
  unitLabel,
} from '../utils/format';
import { useCatalogList } from '../utils/useCatalogList';
import { useCatalogMeta } from '../utils/useCatalogMeta';
import { ItemEditDrawer, MaterialEditDrawer, ServiceEditDrawer } from './CatalogDrawers';
import { StockAdjustDrawer, type StockSubject } from './StockAdjustDrawer';
import { NameWithThumb } from '../components/CatalogImages';

/** Links a catalog row back to the merchant who owns it. */
function MerchantLink({ merchantId, merchantName }: { merchantId: string; merchantName?: string | null }) {
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

/* ---------------------------------- items --------------------------------- */

export function ItemsPage() {
  // Subscribes to the unit catalogue so quantity labels follow admin edits.
  useCatalogMeta();
  const { can } = useAuth();
  const toast = useToast();
  const list = useCatalogList<CatalogItem>(
    useCallback((query, signal) => fetchAdminItems(query, signal) as Promise<Paginated<CatalogItem>>, []),
  );

  const canDelete = can(CATALOG_PERMISSIONS.ITEM_DELETE);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [adjusting, setAdjusting] = useState<StockSubject | null>(null);
  const [deleting, setDeleting] = useState<DeletableRecord | null>(null);
  const [archiving, setArchiving] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = can(CATALOG_PERMISSIONS.ITEM_MANAGE);
  const canAdjust = can(CATALOG_PERMISSIONS.STOCK_ADJUST);

  async function confirmArchive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const result = await setAdminItemArchived(archiving.id, !archiving.archived);
      toast.success(
        archiving.archived ? 'Product restored' : 'Product archived',
        `${result.item.name} keeps its stock history either way.`,
      );
      list.reload();
      setArchiving(null);
    } catch (error) {
      toast.error(
        'Could not update the product',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<CatalogItem>[] = [
    {
      key: 'name',
      header: 'Product',
      grow: true,
      sortable: true,
      render: (item) => <NameWithThumb record={item} name={item.name} />,
    },
    { key: 'sku', header: 'SKU', render: (item) => item.sku ?? '—' },
    { key: 'category', header: 'Category', render: (item) => item.categoryName ?? '—' },
    {
      key: 'archived',
      header: 'Status',
      render: (item) => item.archived ? <ArchivedChip archived /> : 'Active',
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (item) => <MerchantLink merchantId={item.merchantId} merchantName={item.merchantName} />,
    },
    {
      key: 'quantityThousandths',
      header: 'Available',
      sortable: true,
      render: (item) => (
        <StockCell
          quantity={item.quantity}
          unit={item.unit}
          trackStock={item.trackStock}
          unitLabel={unitLabel}
        />
      ),
    },
    {
      key: 'stockStatus',
      header: 'Stock status',
      render: (item) => <StockStatusCell isLowStock={item.isLowStock} isOutOfStock={item.isOutOfStock} trackStock={item.trackStock} />,
    },
    {
      key: 'received',
      header: 'Received',
      numeric: true,
      render: (item) => (
        <span className="text-sm text-secondary text-numeric">
          {item.trackStock ? formatQuantity(item.totalReceived, item.unit) : '—'}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Selling price',
      numeric: true,
      render: (item) => <span className="text-numeric">{formatMoneyMinor(item.sellingPriceMinor)}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      render: (item) => <span className="text-sm text-secondary">{formatDateTime(item.updatedAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Physical things merchants sell. Stock changes only through an adjustment, never through an edit."
        badge={list.loading ? null : <Chip tone="brand">{list.meta.total} total</Chip>}
      />

      <section className="card">
        <CatalogToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchLabel="Search products"
          searchPlaceholder="Search by name or SKU"
          archived={list.archived}
          onArchivedChange={list.setArchived}
          lowStock={{ value: list.lowStock, onChange: list.setLowStock }}
          activeFilters={list.activeFilters}
          onClearFilters={list.clearFilters}
        />

        <DataTable
          caption="Products across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(item) => item.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={{
            title: list.activeFilters.length > 0 ? 'No products match these filters' : 'No products yet',
            message:
              list.activeFilters.length > 0
                ? 'Try a different search term, or clear the filters.'
                : 'Products appear here as soon as a merchant adds something to sell.',
            ...(list.activeFilters.length > 0
              ? { action: { label: 'Clear filters', onClick: list.clearFilters } }
              : {}),
          }}
          {...(canManage || canAdjust
            ? {
                rowActions: (item: CatalogItem) => (
                  <>
                    {canManage ? (
                      <IconButton
                        label={`Edit ${item.name}`}
                        icon={<EditIcon />}
                        onClick={() => setEditing(item)}
                      />
                    ) : null}
                    {canAdjust && item.trackStock && !item.archived ? (
                      <IconButton
                        label={`Adjust stock for ${item.name}`}
                        icon={<SortIcon size={16} />}
                        onClick={() => setAdjusting({ ...item, subjectType: 'item' })}
                      />
                    ) : null}
                    {canManage ? (
                      <IconButton
                        label={`${item.archived ? 'Restore' : 'Archive'} ${item.name}`}
                        icon={<ShieldOffIcon />}
                        onClick={() => setArchiving(item)}
                      />
                    ) : null}
                    {canDelete ? (
                      <IconButton
                        label={`Permanently delete ${item.name}`}
                        icon={<TrashIcon />}
                        onClick={() => setDeleting({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, trackStock: item.trackStock })}
                      />
                    ) : null}
                  </>
                ),
              }
            : {})}
        />

        {!list.loading && !list.error ? (
          <Pagination meta={list.meta} noun="products" onPageChange={list.setPage} onLimitChange={list.setLimit} />
        ) : null}
      </section>

      <ItemEditDrawer item={editing} onClose={() => setEditing(null)} onSaved={list.applyRow} />

      <StockAdjustDrawer
        subject={adjusting}
        onClose={() => setAdjusting(null)}
        onAdjusted={(updated) => list.applyRow(updated as CatalogItem)}
      />

      <ConfirmDialog
        open={archiving !== null}
        title={archiving?.archived ? 'Restore this product?' : 'Archive this product?'}
        message={
          archiving?.archived
            ? `${archiving?.name} will appear in the merchant's catalog again.`
            : `${archiving?.name} will be hidden from the merchant's active catalog. Its stock history is kept.`
        }
        confirmLabel={archiving?.archived ? 'Restore product' : 'Archive product'}
        destructive={!archiving?.archived}
        busy={busy}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />

      <CatalogDeleteDialog
        kind="item"
        record={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => list.reload()}
      />
    </>
  );
}


/* -------------------------------- services -------------------------------- */

export function ServicesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useCatalogList<CatalogService>(
    useCallback(
      (query, signal) => fetchAdminServices(query, signal) as Promise<Paginated<CatalogService>>,
      [],
    ),
  );

  const canDelete = can(CATALOG_PERMISSIONS.SERVICE_DELETE);
  const [editing, setEditing] = useState<CatalogService | null>(null);
  const [deleting, setDeleting] = useState<DeletableRecord | null>(null);
  const [archiving, setArchiving] = useState<CatalogService | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = can(CATALOG_PERMISSIONS.SERVICE_MANAGE);

  async function confirmArchive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const result = await setAdminServiceArchived(archiving.id, !archiving.archived);
      toast.success(archiving.archived ? 'Service restored' : 'Service archived', result.service.name);
      list.reload();
      setArchiving(null);
    } catch (error) {
      toast.error(
        'Could not update the service',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<CatalogService>[] = [
    {
      key: 'name',
      header: 'Service',
      grow: true,
      sortable: true,
      render: (service) => (
        <span className="text-medium">{service.name}</span>
      ),
    },
    { key: 'category', header: 'Category', render: (service) => service.categoryName ?? '—' },
    {
      key: 'archived',
      header: 'Status',
      render: (service) => service.archived ? <ArchivedChip archived /> : 'Active',
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (service) => (
        <MerchantLink merchantId={service.merchantId} merchantName={service.merchantName} />
      ),
    },
    {
      key: 'billing',
      header: 'Billing',
      render: (service) => billingUnitLabel(service.billingUnit),
    },
    {
      key: 'durationMinutes',
      header: 'Duration',
      render: (service) => service.durationMinutes ? `${service.durationMinutes} min` : '—',
    },
    {
      key: 'rateMinor',
      header: 'Rate',
      sortable: true,
      numeric: true,
      render: (service) => <span className="text-numeric">{formatMoneyMinor(service.rateMinor)}</span>,
    },
    {
      key: 'status',
      header: 'Availability',
      render: (service) => (
        <Chip tone={service.isActive ? 'success' : 'neutral'} dot>
          {service.isActive ? 'Offered' : 'Off the menu'}
        </Chip>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      render: (service) => (
        <span className="text-sm text-secondary">{formatDateTime(service.updatedAt)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Services"
        description="Work merchants sell by time, session, unit or package. A service never carries stock."
        badge={list.loading ? null : <Chip tone="brand">{list.meta.total} total</Chip>}
      />

      <section className="card">
        <CatalogToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchLabel="Search services"
          searchPlaceholder="Search by name"
          archived={list.archived}
          onArchivedChange={list.setArchived}
          activeFilters={list.activeFilters}
          onClearFilters={list.clearFilters}
        />

        <DataTable
          caption="Services across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(service) => service.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={{
            title: list.activeFilters.length > 0 ? 'No services match these filters' : 'No services yet',
            message:
              list.activeFilters.length > 0
                ? 'Try a different search term, or clear the filters.'
                : 'Services appear here as soon as a merchant adds work they sell.',
            ...(list.activeFilters.length > 0
              ? { action: { label: 'Clear filters', onClick: list.clearFilters } }
              : {}),
          }}
          {...(canManage
            ? {
                rowActions: (service: CatalogService) => (
                  <>
                    <IconButton
                      label={`Edit ${service.name}`}
                      icon={<EditIcon />}
                      onClick={() => setEditing(service)}
                    />
                    <IconButton
                      label={`${service.archived ? 'Restore' : 'Archive'} ${service.name}`}
                      icon={<ShieldOffIcon />}
                      onClick={() => setArchiving(service)}
                    />
                    {canDelete ? (
                      <IconButton
                        label={`Permanently delete ${service.name}`}
                        icon={<TrashIcon />}
                        onClick={() => setDeleting({ id: service.id, name: service.name })}
                      />
                    ) : null}
                  </>
                ),
              }
            : {})}
        />

        {!list.loading && !list.error ? (
          <Pagination
            meta={list.meta}
            noun="services"
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        ) : null}
      </section>

      <ServiceEditDrawer service={editing} onClose={() => setEditing(null)} onSaved={list.applyRow} />

      <ConfirmDialog
        open={archiving !== null}
        title={archiving?.archived ? 'Restore this service?' : 'Archive this service?'}
        message={
          archiving?.archived
            ? `${archiving?.name} will appear in the merchant's catalog again.`
            : `${archiving?.name} will be hidden from the merchant's active catalog.`
        }
        confirmLabel={archiving?.archived ? 'Restore service' : 'Archive service'}
        destructive={!archiving?.archived}
        busy={busy}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />

      <CatalogDeleteDialog
        kind="service"
        record={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => list.reload()}
      />
    </>
  );
}

/* -------------------------------- materials ------------------------------- */

export function MaterialsPage() {
  // Subscribes to the unit catalogue so quantity labels follow admin edits.
  useCatalogMeta();
  const { can } = useAuth();
  const toast = useToast();
  const list = useCatalogList<CatalogMaterial>(
    useCallback(
      (query, signal) => fetchAdminMaterials(query, signal) as Promise<Paginated<CatalogMaterial>>,
      [],
    ),
  );

  const canDelete = can(CATALOG_PERMISSIONS.MATERIAL_DELETE);
  const [editing, setEditing] = useState<CatalogMaterial | null>(null);
  const [adjusting, setAdjusting] = useState<StockSubject | null>(null);
  const [deleting, setDeleting] = useState<DeletableRecord | null>(null);
  const [archiving, setArchiving] = useState<CatalogMaterial | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = can(CATALOG_PERMISSIONS.MATERIAL_MANAGE);
  const canAdjust = can(CATALOG_PERMISSIONS.STOCK_ADJUST);

  async function confirmArchive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const result = await setAdminMaterialArchived(archiving.id, !archiving.archived);
      toast.success(
        archiving.archived ? 'Raw material restored' : 'Raw material archived',
        result.material.name,
      );
      list.reload();
      setArchiving(null);
    } catch (error) {
      toast.error(
        'Could not update the raw material',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<CatalogMaterial>[] = [
    {
      key: 'name',
      header: 'Raw material',
      grow: true,
      sortable: true,
      render: (material) => <NameWithThumb record={material} name={material.name} />,
    },
    { key: 'batchReference', header: 'Batch reference', render: (material) => material.batchReference ?? '—' },
    { key: 'category', header: 'Category', render: (material) => material.categoryName ?? '—' },
    {
      key: 'archived',
      header: 'Status',
      render: (material) => material.archived ? <ArchivedChip archived /> : 'Active',
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (material) => (
        <MerchantLink merchantId={material.merchantId} merchantName={material.merchantName} />
      ),
    },
    {
      key: 'quantityThousandths',
      header: 'Available',
      sortable: true,
      render: (material) => (
        <StockCell
          quantity={material.quantity}
          unit={material.unit}
          trackStock={material.trackStock}
          unitLabel={unitLabel}
        />
      ),
    },
    {
      key: 'stockStatus',
      header: 'Stock status',
      render: (material) => <StockStatusCell isLowStock={material.isLowStock} isOutOfStock={material.isOutOfStock} trackStock={material.trackStock} />,
    },
    {
      key: 'received',
      header: 'Received',
      numeric: true,
      render: (material) => (
        <span className="text-sm text-secondary text-numeric">
          {material.trackStock ? formatQuantity(material.totalReceived, material.unit) : '—'}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Purchase cost',
      numeric: true,
      render: (material) => (
        <span className="text-numeric">{formatMoneyMinor(material.purchaseCostMinor)}</span>
      ),
    },
    {
      key: 'expiryDate',
      header: 'Expires',
      sortable: true,
      render: (material) => (
        <span className="text-sm text-secondary">
          {material.expiryDate ? formatDate(material.expiryDate) : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Raw materials"
        description="Inputs merchants buy before making or selling something."
        badge={list.loading ? null : <Chip tone="brand">{list.meta.total} total</Chip>}
      />

      <section className="card">
        <CatalogToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchLabel="Search raw materials"
          searchPlaceholder="Search by name or batch"
          archived={list.archived}
          onArchivedChange={list.setArchived}
          lowStock={{ value: list.lowStock, onChange: list.setLowStock }}
          activeFilters={list.activeFilters}
          onClearFilters={list.clearFilters}
        />

        <DataTable
          caption="Raw materials across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(material) => material.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={list.sort}
          onSortChange={list.setSort}
          empty={{
            title:
              list.activeFilters.length > 0
                ? 'No raw materials match these filters'
                : 'No raw materials yet',
            message:
              list.activeFilters.length > 0
                ? 'Try a different search term, or clear the filters.'
                : 'Raw materials appear here as soon as a merchant records what they buy.',
            ...(list.activeFilters.length > 0
              ? { action: { label: 'Clear filters', onClick: list.clearFilters } }
              : {}),
          }}
          {...(canManage || canAdjust
            ? {
                rowActions: (material: CatalogMaterial) => (
                  <>
                    {canManage ? (
                      <IconButton
                        label={`Edit ${material.name}`}
                        icon={<EditIcon />}
                        onClick={() => setEditing(material)}
                      />
                    ) : null}
                    {canAdjust && material.trackStock && !material.archived ? (
                      <IconButton
                        label={`Adjust stock for ${material.name}`}
                        icon={<SortIcon size={16} />}
                        onClick={() => setAdjusting({ ...material, subjectType: 'material' })}
                      />
                    ) : null}
                    {canManage ? (
                      <IconButton
                        label={`${material.archived ? 'Restore' : 'Archive'} ${material.name}`}
                        icon={<ShieldOffIcon />}
                        onClick={() => setArchiving(material)}
                      />
                    ) : null}
                    {canDelete ? (
                      <IconButton
                        label={`Permanently delete ${material.name}`}
                        icon={<TrashIcon />}
                        onClick={() => setDeleting({ id: material.id, name: material.name, quantity: material.quantity, unit: material.unit, trackStock: material.trackStock })}
                      />
                    ) : null}
                  </>
                ),
              }
            : {})}
        />

        {!list.loading && !list.error ? (
          <Pagination
            meta={list.meta}
            noun="raw materials"
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        ) : null}
      </section>

      <MaterialEditDrawer material={editing} onClose={() => setEditing(null)} onSaved={list.applyRow} />

      <StockAdjustDrawer
        subject={adjusting}
        onClose={() => setAdjusting(null)}
        onAdjusted={(updated) => list.applyRow(updated as CatalogMaterial)}
      />

      <ConfirmDialog
        open={archiving !== null}
        title={archiving?.archived ? 'Restore this raw material?' : 'Archive this raw material?'}
        message={
          archiving?.archived
            ? `${archiving?.name} will appear in the merchant's catalog again.`
            : `${archiving?.name} will be hidden from the merchant's active catalog. Its stock history is kept.`
        }
        confirmLabel={archiving?.archived ? 'Restore material' : 'Archive material'}
        destructive={!archiving?.archived}
        busy={busy}
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />

      <CatalogDeleteDialog
        kind="material"
        record={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => list.reload()}
      />
    </>
  );
}

/* -------------------------------- low stock ------------------------------- */

export function LowStockPage() {
  // Subscribes to the unit catalogue so quantity labels follow admin edits.
  useCatalogMeta();
  const { can } = useAuth();
  const list = useCatalogList<LowStockRow>(
    useCallback((query, signal) => fetchAdminLowStock(query, signal) as Promise<Paginated<LowStockRow>>, []),
    { lowStock: true },
  );

  const [adjusting, setAdjusting] = useState<StockSubject | null>(null);
  const canAdjust = can(CATALOG_PERMISSIONS.STOCK_ADJUST);

  const columns: Column<LowStockRow>[] = [
    {
      key: 'name',
      header: 'Record',
      grow: true,
      render: (row) => <span className="text-medium">{row.name}</span>,
    },
    {
      key: 'recordType',
      header: 'Record type',
      render: (row) => (
        <Chip tone={row.type === 'item' ? 'brand' : 'info'}>
          {row.type === 'item' ? 'Product' : 'Raw material'}
        </Chip>
      ),
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (row) => <MerchantLink merchantId={row.merchantId} merchantName={row.merchantName} />,
    },
    {
      key: 'quantity',
      header: 'Available',
      numeric: true,
      render: (row) => (
        <span className="text-numeric text-medium">{formatQuantity(row.quantity, row.unit)}</span>
      ),
    },
    {
      key: 'threshold',
      header: 'Threshold',
      numeric: true,
      render: (row) => (
        <span className="text-numeric text-secondary">
          {formatQuantity(row.lowStockThreshold, row.unit)}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (
        <Chip tone={row.isOutOfStock ? 'danger' : 'warning'} dot>
          {row.isOutOfStock ? 'Out of stock' : 'Low stock'}
        </Chip>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Needs attention"
        description="Everything running low or out of stock, across all merchants, worst first."
        badge={list.loading ? null : <Chip tone="warning">{list.meta.total} records</Chip>}
      />

      <section className="card">
        <DataTable
          caption="Low and out-of-stock records across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(row) => `${row.type}-${row.id}`}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={{
            title: 'Nothing needs attention',
            message:
              'No merchant currently has a product or raw material at or below its low-stock threshold.',
          }}
          {...(canAdjust
            ? {
                rowActions: (row: LowStockRow) => (
                  <IconButton
                    label={`Adjust stock for ${row.name}`}
                    icon={<SortIcon size={16} />}
                    onClick={() =>
                      setAdjusting({
                        id: row.id,
                        name: row.name,
                        unit: row.unit,
                        quantity: row.quantity,
                        subjectType: row.type,
                      })
                    }
                  />
                ),
              }
            : {})}
        />

        {!list.loading && !list.error ? (
          <Pagination
            meta={list.meta}
            noun="records"
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        ) : null}
      </section>

      <StockAdjustDrawer
        subject={adjusting}
        onClose={() => setAdjusting(null)}
        // The summary row carries no full record, so the list is refetched.
        onAdjusted={() => list.reload()}
      />
    </>
  );
}

/* ------------------------------ stock activity ---------------------------- */

export function StockActivityPage() {
  // Subscribes to the unit catalogue so quantity labels follow admin edits.
  useCatalogMeta();
  const list = useCatalogList<StockMovement>(
    useCallback(
      (query, signal) =>
        fetchAdminStockMovements(
          { merchantId: query.merchantId, page: query.page, limit: query.limit },
          signal,
        ) as Promise<Paginated<StockMovement>>,
      [],
    ),
  );

  const columns: Column<StockMovement>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (movement) => (
        <span className="text-sm text-secondary">{formatDateTime(movement.createdAt)}</span>
      ),
    },
    {
      key: 'merchant',
      header: 'Merchant',
      render: (movement) =>
        movement.merchantId ? (
          <MerchantLink merchantId={movement.merchantId} merchantName={movement.merchantName} />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'subject',
      header: 'Record',
      grow: true,
      render: (movement) => <span className="text-medium">{movement.subjectName}</span>,
    },
    {
      key: 'subjectType',
      header: 'Record type',
      render: (movement) => (
        <Chip tone={movement.subjectType === 'item' ? 'brand' : 'info'}>
          {movement.subjectType === 'item' ? 'Product' : 'Raw material'}
        </Chip>
      ),
    },
    {
      key: 'type',
      header: 'Movement',
      render: (movement) => movementTypeLabel(movement.type),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (movement) => stockReasonLabel(movement.reason),
    },
    {
      key: 'delta',
      header: 'Change',
      numeric: true,
      render: (movement) => (
        <span className={`text-numeric text-medium`}>{formatDelta(movement.delta)}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance after',
      numeric: true,
      render: (movement) => <span className="text-numeric">{movement.balanceAfter}</span>,
    },
    {
      key: 'actor',
      header: 'Who',
      render: (movement) => <span className="text-sm truncate">{movement.actorLabel}</span>,
    },
    {
      key: 'actorType',
      header: 'Actor type',
      render: (movement) => (
        <Chip tone={movement.actorType === 'admin' ? 'info' : 'brand'} dot>
          {movement.actorType}
        </Chip>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock activity"
        description="Every quantity change ever recorded, with its reason and who made it."
      />

      <section className="card">
        <DataTable
          caption="Stock ledger across all merchants"
          columns={columns}
          rows={list.rows}
          rowKey={(movement) => movement.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          empty={{
            title: 'No stock movements yet',
            message:
              'Opening balances, adjustments and later purchases and sales all appear here as they happen.',
          }}
        />

        {!list.loading && !list.error ? (
          <Pagination
            meta={list.meta}
            noun="movements"
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        ) : null}
      </section>
    </>
  );
}
