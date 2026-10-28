import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchAuditLogs } from '../api/endpoints';
import type { AuditEntry, PageMeta } from '../api/types';
import { Chip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { SearchInput } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { formatAuditAction, formatAuditValue, formatDateTime } from '../utils/format';
import { useDebounce } from '../utils/useDebounce';

const ACTOR_OPTIONS = [
  { value: '', label: 'All actors' },
  { value: 'merchant', label: 'Merchants' },
  { value: 'admin', label: 'Admins' },
  { value: 'system', label: 'System' },
];

const EMPTY_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false };

const ACTOR_TONE = {
  merchant: 'brand',
  admin: 'info',
  system: 'neutral',
} as const;

export function AuditPage() {
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const debouncedAction = useDebounce(action);

  useEffect(() => setPage(1), [actorType, debouncedAction, limit]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAuditLogs(
          { actorType, action: debouncedAction.trim(), page, limit },
          controller.signal,
        );
        if (cancelled) return;
        setEntries(result.items);
        setMeta(result.meta);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setEntries([]);
        setMeta(EMPTY_META);
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load the audit history. Please try again.',
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
  }, [actorType, debouncedAction, page, limit, reloadToken]);

  const columns: Column<AuditEntry>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (entry) => <span className="text-sm text-secondary">{formatDateTime(entry.createdAt)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (entry) => (
        <span className="text-medium truncate">{entry.actorLabel}</span>
      ),
    },
    {
      key: 'actorType',
      header: 'Actor type',
      render: (entry) => <Chip tone={ACTOR_TONE[entry.actorType]} dot>{entry.actorType}</Chip>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (entry) => <span className="text-medium">{formatAuditAction(entry.action)}</span>,
    },
    {
      key: 'actionCode',
      header: 'Action code',
      render: (entry) => <span className="text-xs text-muted text-mono">{entry.action}</span>,
    },
    {
      key: 'summary',
      header: 'What happened',
      grow: true,
      render: (entry) => <span>{entry.summary}</span>,
    },
    {
      key: 'changes',
      header: 'Changes',
      render: (entry) => entry.changes.length > 0 ? (
        <span className="text-xs text-muted text-mono">
          {entry.changes
            .map((change) => `${change.field}: ${formatAuditValue(change.from)} → ${formatAuditValue(change.to)}`)
            .join(' · ')}
        </span>
      ) : '—',
    },
    {
      key: 'target',
      header: 'Target',
      render: (entry) =>
        entry.targetType === 'merchant' && entry.targetId ? (
          <Link to={`/merchants/${entry.targetId}`} className="row-link text-sm">
            View merchant
          </Link>
        ) : (
          <span className="text-sm text-muted">{entry.targetType}</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit history"
        description="A readable record of sensitive actions across the product."
      />

      <section className="card">
        <div className="toolbar">
          <SearchInput
            value={action}
            onChange={setAction}
            label="Filter by action"
            placeholder="Filter by exact action, e.g. merchant.registered"
          />
          <div className="toolbar__filters">
            <label className="sr-only" htmlFor="filter-actor">
              Filter by actor
            </label>
            <select
              id="filter-actor"
              className="select"
              value={actorType}
              onChange={(event) => setActorType(event.target.value)}
            >
              {ACTOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          caption="Audit history"
          columns={columns}
          rows={entries}
          rowKey={(entry) => entry.id}
          loading={loading}
          error={error}
          onRetry={() => setReloadToken((token) => token + 1)}
          empty={{
            title: 'No matching activity',
            message:
              'Sensitive actions such as registrations, sign-ins, profile edits and status changes are recorded here.',
          }}
        />

        {!loading && !error ? (
          <Pagination meta={meta} noun="entries" onPageChange={setPage} onLimitChange={setLimit} />
        ) : null}
      </section>
    </>
  );
}
