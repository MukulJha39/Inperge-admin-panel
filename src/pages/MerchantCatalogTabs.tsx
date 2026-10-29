import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import {
  fetchAdminStockMovements,
  fetchMerchantBusiness,
  fetchMerchantCatalogSummary,
  fetchMerchantCategories,
  updateMerchantBusiness,
} from '../api/endpoints';
import type {
  Business,
  CatalogSummary,
  Category,
  Paginated,
  StockMovement,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CATALOG_PERMISSIONS } from '../auth/permissions';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { EditIcon } from '../components/Icon';
import { Pagination } from '../components/Pagination';
import { ErrorState, InlineAlert, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import {
  businessCategoryLabel,
  formatDateTime,
  formatDelta,
  formatQuantity,
  movementTypeLabel,
  stockReasonLabel,
} from '../utils/format';
import { useCatalogList } from '../utils/useCatalogList';
import { useCatalogMeta } from '../utils/useCatalogMeta';
import { CategoryManagerDrawer } from './CatalogForms';

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="summary-item">
      <div className="summary-item__label">{label}</div>
      <div className="summary-item__value">{children}</div>
    </div>
  );
}

/* --------------------------------- business -------------------------------- */

function BusinessEditDrawer({
  merchantId,
  business,
  onClose,
  onSaved,
}: {
  merchantId: string;
  business: Business | null;
  onClose: () => void;
  onSaved: (updated: Business) => void;
}) {
  const toast = useToast();
  const { meta } = useCatalogMeta();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [lowStockAlerts, setLowStockAlerts] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!business) return;
    setName(business.name ?? '');
    setCategory(business.category ?? '');
    setTaxNumber(business.taxNumber ?? '');
    setCity(business.address.city ?? '');
    setState(business.address.state ?? '');
    setCountry(business.address.country ?? '');
    setCurrency(business.currency);
    setPaymentTerms(
      business.defaultPaymentTermsDays === null ? '' : String(business.defaultPaymentTermsDays),
    );
    setLowStockAlerts(business.lowStockAlertsEnabled);
    setFieldErrors({});
    setFormError(null);
  }, [business]);

  if (!business) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (saving) return;

    const errors: Record<string, string> = {};
    if (name.trim().length > 120) errors.name = 'Use 120 characters or fewer.';
    if (paymentTerms.trim() !== '') {
      const parsed = Number(paymentTerms);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
        errors.defaultPaymentTermsDays = 'Enter a whole number of days between 0 and 365.';
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const result = await updateMerchantBusiness(merchantId, {
        name: name.trim() || null,
        category: category || null,
        taxNumber: taxNumber.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        country: country.trim() || null,
        currency,
        defaultPaymentTermsDays: paymentTerms.trim() === '' ? null : Number(paymentTerms),
        lowStockAlertsEnabled: lowStockAlerts,
      });

      toast.success('Business updated', 'The merchant sees this change in their app.');
      onSaved(result.business);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      title="Edit business profile"
      description="Every field here is optional for the merchant; setup is never blocking."
      busy={saving}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" form="business-form" type="submit" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="business-form" className="stack gap-5" onSubmit={handleSubmit} noValidate>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <TextField
          label="Business name"
          optional
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
        />

        <SelectField
          label="Business category"
          optional
          placeholder="Not set"
          options={meta.businessCategories.map((value) => ({
            value,
            label: businessCategoryLabel(value),
          }))}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          {...(fieldErrors.category ? { error: fieldErrors.category } : {})}
        />

        <TextField
          label="Tax number"
          optional
          value={taxNumber}
          onChange={(event) => setTaxNumber(event.target.value)}
          maxLength={40}
        />

        <TextField
          label="City"
          optional
          value={city}
          onChange={(event) => setCity(event.target.value)}
          maxLength={80}
        />

        <TextField
          label="State"
          optional
          value={state}
          onChange={(event) => setState(event.target.value)}
          maxLength={80}
        />

        <TextField
          label="Country"
          optional
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          maxLength={80}
        />

        <SelectField
          label="Currency"
          options={meta.currencies.map((value) => ({ value, label: value }))}
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          {...(fieldErrors.currency ? { error: fieldErrors.currency } : {})}
        />

        <TextField
          label="Default payment terms in days"
          optional
          type="number"
          step="1"
          min="0"
          max="365"
          inputMode="numeric"
          value={paymentTerms}
          onChange={(event) => setPaymentTerms(event.target.value)}
          {...(fieldErrors.defaultPaymentTermsDays
            ? { error: fieldErrors.defaultPaymentTermsDays }
            : {})}
        />

        <SelectField
          label="Low stock alerts"
          options={[
            { value: 'on', label: 'Shown in the app' },
            { value: 'off', label: 'Hidden' },
          ]}
          value={lowStockAlerts ? 'on' : 'off'}
          onChange={(event) => setLowStockAlerts(event.target.value === 'on')}
        />
      </form>
    </Drawer>
  );
}

export function MerchantBusinessPanel({ merchantId }: { merchantId: string }) {
  const { can } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const canManageCategories =
    can(CATALOG_PERMISSIONS.ITEM_MANAGE) ||
    can(CATALOG_PERMISSIONS.SERVICE_MANAGE) ||
    can(CATALOG_PERMISSIONS.MATERIAL_MANAGE);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [businessResult, summaryResult, categoriesResult] = await Promise.all([
          fetchMerchantBusiness(merchantId, controller.signal),
          fetchMerchantCatalogSummary(merchantId, controller.signal),
          fetchMerchantCategories(merchantId, controller.signal),
        ]);
        if (cancelled) return;
        setBusiness(businessResult.business);
        setSummary(summaryResult.summary);
        setCategories(categoriesResult.categories);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load the business profile.',
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
  }, [merchantId, reloadToken]);

  if (loading) {
    return (
      <section className="card">
        <div className="card__body stack gap-4">
          <Skeleton width="40%" height="18px" />
          <Skeleton width="100%" height="90px" radius="var(--radius-md)" />
        </div>
      </section>
    );
  }

  if (error || !business) {
    return (
      <section className="card">
        <ErrorState
          message={error ?? 'Could not load the business profile.'}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      </section>
    );
  }

  return (
    <>
      <section className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="card__header">
          <div className="stack gap-1">
            <h3 className="card__title">Business profile</h3>
            <p className="text-sm text-secondary">
              {business.completion.completed} of {business.completion.total} details filled in
            </p>
          </div>
          {can(CATALOG_PERMISSIONS.BUSINESS_EDIT) ? (
            <Button icon={<EditIcon />} onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          ) : null}
        </div>

        <div className="card__body stack gap-5">
          {business.completion.missing.length > 0 ? (
            <InlineAlert tone="info">
              Still to add: {business.completion.missing.join(', ')}. The merchant can use the app
              fully without these.
            </InlineAlert>
          ) : null}

          <div className="summary-grid">
            <SummaryItem label="Name">{business.name ?? '—'}</SummaryItem>
            <SummaryItem label="Category">{businessCategoryLabel(business.category)}</SummaryItem>
            <SummaryItem label="Currency">
              <Chip mono>{business.currency}</Chip>
            </SummaryItem>
            <SummaryItem label="City">{business.address.city ?? '—'}</SummaryItem>
            <SummaryItem label="State">{business.address.state ?? '—'}</SummaryItem>
            <SummaryItem label="Country">{business.address.country ?? '—'}</SummaryItem>
            <SummaryItem label="Contact number">
              {business.contact.phone
                ? `${business.contact.countryCode ?? ''} ${business.contact.phone}`.trim()
                : '—'}
            </SummaryItem>
            <SummaryItem label="Contact email">{business.contact.email ?? '—'}</SummaryItem>
            <SummaryItem label="Tax number">{business.taxNumber ?? '—'}</SummaryItem>
            <SummaryItem label="Payment terms">
              {business.defaultPaymentTermsDays === null
                ? '—'
                : `${business.defaultPaymentTermsDays} days`}
            </SummaryItem>
            <SummaryItem label="Low stock alerts">
              <Chip tone={business.lowStockAlertsEnabled ? 'success' : 'neutral'} dot>
                {business.lowStockAlertsEnabled ? 'Shown' : 'Hidden'}
              </Chip>
            </SummaryItem>
          </div>
        </div>
      </section>

      {summary ? (
        <section className="card" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="card__header">
            <h3 className="card__title">Catalog at a glance</h3>
          </div>
          <div className="card__body">
            <div className="summary-grid">
              <SummaryItem label="Products">
                <span className="text-numeric">{summary.items.active}</span>
                {summary.items.lowStock > 0 ? (
                  <Chip tone="warning" dot>
                    {summary.items.lowStock} need attention
                  </Chip>
                ) : null}
              </SummaryItem>
              <SummaryItem label="Services">
                <span className="text-numeric">{summary.services.active}</span>
                {summary.services.inactive > 0 ? (
                  <Chip>{summary.services.inactive} off the menu</Chip>
                ) : null}
              </SummaryItem>
              <SummaryItem label="Raw materials">
                <span className="text-numeric">{summary.materials.active}</span>
                {summary.materials.lowStock > 0 ? (
                  <Chip tone="warning" dot>
                    {summary.materials.lowStock} need attention
                  </Chip>
                ) : null}
              </SummaryItem>
              <SummaryItem label="Categories">
                <span className="text-numeric">{summary.categories}</span>
              </SummaryItem>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card__header">
          <h3 className="card__title">Categories</h3>
          <span className="row gap-3">
            <span className="text-sm text-muted">{categories.length} defined</span>
            {canManageCategories ? (
              <Button size="sm" variant="secondary" onClick={() => setManagingCategories(true)}>
                Manage categories
              </Button>
            ) : null}
          </span>
        </div>
        <div className="card__body">
          {categories.length === 0 ? (
            <p className="text-secondary">
              This merchant has not grouped their catalog into categories yet.
            </p>
          ) : (
            <div className="matrix__permissions">
              {categories.map((category) => (
                <span key={category.id} className="chip">
                  {category.name}
                  <span className="text-xs text-muted">
                    {category.kind}
                    {typeof category.usageCount === 'number' ? ` · ${category.usageCount}` : ''}
                    {category.archived ? ' · archived' : ''}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <CategoryManagerDrawer
        merchantId={merchantId}
        merchantName={business?.name ?? null}
        open={managingCategories}
        onClose={() => setManagingCategories(false)}
        onChanged={() => setReloadToken((token) => token + 1)}
      />

      <BusinessEditDrawer
        merchantId={merchantId}
        business={editing ? business : null}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setBusiness(updated);
          setReloadToken((token) => token + 1);
        }}
      />
    </>
  );
}

/* ---------------------------- per-merchant tables --------------------------- */

/** A compact table for one merchant: no merchant column, since it is already known. */
function MerchantPanel<T extends { id: string }>({
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
        <Pagination meta={list.meta} noun={noun} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      ) : null}
    </section>
  );
}

export function MerchantStockPanel({ merchantId }: { merchantId: string }) {
  const list = useCatalogList<StockMovement>(
    useCallback(
      (query, signal) =>
        fetchAdminStockMovements(
          { merchantId: query.merchantId, page: query.page, limit: query.limit },
          signal,
        ) as Promise<Paginated<StockMovement>>,
      [],
    ),
    { merchantId },
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
      key: 'subject',
      header: 'Record',
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
      render: (movement) => <span className="text-numeric text-medium">{formatDelta(movement.delta)}</span>,
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
    {
      key: 'note',
      header: 'Note',
      grow: true,
      render: (movement) => (
        <span className="text-sm text-secondary">{movement.note ?? '—'}</span>
      ),
    },
  ];

  return (
    <MerchantPanel
      columns={columns}
      list={list}
      noun="movements"
      emptyTitle="No stock movements yet"
      emptyMessage="Opening balances and adjustments appear here as they happen."
    />
  );
}

/** Re-exported so the detail page can show a quantity in a summary row. */
export { formatQuantity };
