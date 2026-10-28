import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchMerchants } from '../api/endpoints';
import type { Gender, Merchant, MerchantStatus, PageMeta } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PERMISSIONS } from '../auth/permissions';
import { Avatar } from '../components/Avatar';
import { IconButton } from '../components/Button';
import { ActiveFilters } from '../components/ActiveFilters';
import { Chip, MerchantStatusChip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { SearchInput } from '../components/Field';
import { EditIcon, EyeIcon, ShieldOffIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { formatDateTime, formatPhone, genderLabel, GENDER_OPTIONS } from '../utils/format';
import { useDebounce } from '../utils/useDebounce';
import { MerchantFormDrawer } from './MerchantFormDrawer';
import { MerchantStatusDialog } from './MerchantStatusDialog';

const STATUS_OPTIONS: Array<{ value: MerchantStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const EMPTY_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false };

export function MerchantsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MerchantStatus | ''>('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [sort, setSort] = useState('-createdAt');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [editing, setEditing] = useState<Merchant | null>(null);
  const [changingStatus, setChangingStatus] = useState<Merchant | null>(null);

  const debouncedSearch = useDebounce(search);

  // Any change to the query itself returns to the first page.
  useEffect(() => setPage(1), [debouncedSearch, status, gender, sort, limit]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchMerchants(
          { search: debouncedSearch.trim(), status, gender, sort, page, limit },
          controller.signal,
        );
        if (cancelled) return;
        setMerchants(result.items);
        setMeta(result.meta);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setMerchants([]);
        setMeta(EMPTY_META);
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load merchants. Please try again.',
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
  }, [debouncedSearch, status, gender, sort, page, limit, reloadToken]);

  const applyUpdate = useCallback((updated: Merchant) => {
    setMerchants((current) => current.map((row) => (row.id === updated.id ? updated : row)));
  }, []);

  const activeFilters = useMemo(() => {
    const filters: Array<{ label: string; clear: () => void }> = [];
    if (debouncedSearch.trim()) filters.push({ label: `Search: ${debouncedSearch.trim()}`, clear: () => setSearch('') });
    if (status) filters.push({ label: `Status: ${status === 'active' ? 'Active' : 'Suspended'}`, clear: () => setStatus('') });
    if (gender) filters.push({ label: `Gender: ${genderLabel(gender)}`, clear: () => setGender('') });
    return filters;
  }, [debouncedSearch, status, gender]);

  const columns: Column<Merchant>[] = [
    {
      key: 'firstName',
      header: 'Merchant',
      grow: true,
      sortable: true,
      render: (merchant) => (
        <div className="row gap-3">
          <Avatar name={merchant.fullName} photoUrl={merchant.photoUrl} size="sm" />
          <Link to={`/merchants/${merchant.id}`} className="row-link">
            {merchant.fullName}
          </Link>
        </div>
      ),
    },
    { key: 'gender', header: 'Gender', render: (merchant) => genderLabel(merchant.gender) },
    {
      key: 'phone',
      header: 'Mobile number',
      render: (merchant) => (
        <span className="text-mono text-sm">{formatPhone(merchant.countryCode, merchant.phone)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (merchant) => <MerchantStatusChip status={merchant.status} />,
    },
    {
      key: 'locale',
      header: 'Language',
      render: (merchant) => (
        <Chip mono>{merchant.locale}</Chip>
      ),
    },
    {
      key: 'createdAt',
      header: 'Registered',
      sortable: true,
      render: (merchant) => <span className="text-sm text-secondary">{formatDateTime(merchant.createdAt)}</span>,
    },
    {
      key: 'lastLoginAt',
      header: 'Last signed in',
      sortable: true,
      render: (merchant) => <span className="text-sm text-secondary">{formatDateTime(merchant.lastLoginAt)}</span>,
    },
  ];

  const canEdit = can(PERMISSIONS.MERCHANT_EDIT);
  const canSuspend = can(PERMISSIONS.MERCHANT_SUSPEND);

  return (
    <>
      <PageHeader
        title="Merchants"
        description="Everyone running their business in the Inperge app."
        badge={loading ? null : <Chip tone="brand">{meta.total} total</Chip>}
      />

      <section className="card">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search merchants"
            placeholder="Search by name or phone number"
          />

          <div className="toolbar__filters">
            <label className="sr-only" htmlFor="filter-status">
              Filter by status
            </label>
            <select
              id="filter-status"
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value as MerchantStatus | '')}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="filter-gender">
              Filter by gender
            </label>
            <select
              id="filter-gender"
              className="select"
              value={gender}
              onChange={(event) => setGender(event.target.value as Gender | '')}
            >
              <option value="">All genders</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ActiveFilters
          filters={activeFilters}
          onClearAll={() => {
            setSearch('');
            setStatus('');
            setGender('');
          }}
        />

        <DataTable
          caption="Merchants registered in the app"
          columns={columns}
          rows={merchants}
          rowKey={(merchant) => merchant.id}
          loading={loading}
          error={error}
          onRetry={() => setReloadToken((token) => token + 1)}
          sort={sort}
          onSortChange={setSort}
          empty={{
            title: activeFilters.length > 0 ? 'No merchants match these filters' : 'No merchants yet',
            message:
              activeFilters.length > 0
                ? 'Try a different search term, or clear the filters to see everyone.'
                : 'Merchants appear here as soon as they verify their phone number and register in the app.',
            ...(activeFilters.length > 0
              ? {
                  action: {
                    label: 'Clear filters',
                    onClick: () => {
                      setSearch('');
                      setStatus('');
                      setGender('');
                    },
                  },
                }
              : {}),
          }}
          rowHref={(merchant) => `/merchants/${merchant.id}`}
          // Every row has somewhere to go, so the actions column is always present.
          rowActions={(merchant) => (
            <>
              <IconButton
                label={`View ${merchant.fullName}`}
                icon={<EyeIcon />}
                onClick={() => navigate(`/merchants/${merchant.id}`)}
              />
              {canEdit ? (
                <IconButton
                  label={`Edit ${merchant.fullName}`}
                  icon={<EditIcon />}
                  onClick={() => setEditing(merchant)}
                />
              ) : null}
              {canSuspend ? (
                <IconButton
                  label={
                    merchant.status === 'active'
                      ? `Suspend ${merchant.fullName}`
                      : `Reactivate ${merchant.fullName}`
                  }
                  icon={<ShieldOffIcon />}
                  onClick={() => setChangingStatus(merchant)}
                />
              ) : null}
            </>
          )}
        />

        {!loading && !error ? (
          <Pagination meta={meta} noun="merchants" onPageChange={setPage} onLimitChange={setLimit} />
        ) : null}
      </section>

      <MerchantFormDrawer merchant={editing} onClose={() => setEditing(null)} onSaved={applyUpdate} />

      <MerchantStatusDialog
        merchant={changingStatus}
        onClose={() => setChangingStatus(null)}
        onChanged={applyUpdate}
      />
    </>
  );
}
