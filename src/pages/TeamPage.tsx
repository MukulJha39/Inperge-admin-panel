import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchAdmins, fetchRoles } from '../api/endpoints';
import type { AdminMember, AdminStatus, PageMeta, RoleWithPermissions } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PERMISSIONS } from '../auth/permissions';
import { Avatar } from '../components/Avatar';
import { Button, IconButton } from '../components/Button';
import { Chip } from '../components/Chip';
import { DataTable, type Column } from '../components/DataTable';
import { SearchInput } from '../components/Field';
import { EditIcon, KeyIcon, PlusIcon, ShieldOffIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { InlineAlert } from '../components/States';
import { formatDateTime } from '../utils/format';
import { useDebounce } from '../utils/useDebounce';
import { MemberFormDrawer, MemberStatusDialog, ResetPasswordDrawer } from './TeamDrawers';

/**
 * The admin team.
 *
 * Accounts are never deleted here, only suspended: an admin who has left should stop being
 * able to sign in, but the audit entries they left behind must keep naming a real account
 * (PRD section 27).
 *
 * An admin's own row carries no actions. Changing your own role or suspending yourself is
 * how one mistake takes away the access needed to undo it, so the API refuses both and the
 * panel does not offer them.
 */

const STATUS_OPTIONS: Array<{ value: AdminStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const EMPTY_META: PageMeta = { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false };

export function TeamPage() {
  const { admin, can } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AdminStatus | ''>('');
  const [roleId, setRoleId] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [editing, setEditing] = useState<AdminMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminMember | null>(null);
  const [changingStatus, setChangingStatus] = useState<AdminMember | null>(null);

  const debouncedSearch = useDebounce(search);
  const canManage = can(PERMISSIONS.ADMIN_MANAGE);
  const canSeeRoles = can(PERMISSIONS.ROLE_VIEW);

  useEffect(() => setPage(1), [debouncedSearch, status, roleId, sort, limit]);

  // The role list fills the filter and the form; without role.view the filter is hidden
  // and the form falls back to whatever the API returns on save.
  useEffect(() => {
    if (!canSeeRoles) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchRoles(controller.signal);
        if (!cancelled) setRoles(result.roles);
      } catch {
        // A missing role list is not worth failing the page for: the table still reads.
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [canSeeRoles, reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAdmins(
          { search: debouncedSearch.trim(), status, roleId, sort, page, limit },
          controller.signal,
        );
        if (cancelled) return;
        setMembers(result.items);
        setMeta(result.meta);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setMembers([]);
        setMeta(EMPTY_META);
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load the admin team. Please try again.',
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
  }, [debouncedSearch, status, roleId, sort, page, limit, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const roleOptions = useMemo(
    () => [{ value: '', label: 'All roles' }, ...roles.map((role) => ({ value: role.id, label: role.name }))],
    [roles],
  );

  const hasFilters = debouncedSearch.trim() !== '' || status !== '' || roleId !== '';

  function clearFilters() {
    setSearch('');
    setStatus('');
    setRoleId('');
  }

  const columns: Column<AdminMember>[] = [
    {
      key: 'name',
      header: 'Member',
      grow: true,
      sortable: true,
      render: (member) => (
        <div className="row gap-3">
          <Avatar name={member.name} size="sm" />
          <span className="text-medium">{member.name}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (member) => <span className="text-sm text-secondary">{member.email}</span> },
    { key: 'isCurrentAdmin', header: 'Current admin', render: (member) => member.id === admin?.id ? 'You' : '—' },
    {
      key: 'role',
      header: 'Role',
      render: (member) => <Chip tone="brand">{member.role.name}</Chip>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (member) => (
        <Chip tone={member.status === 'active' ? 'success' : 'danger'} dot>
          {member.status === 'active' ? 'Active' : 'Suspended'}
        </Chip>
      ),
    },
    {
      key: 'mustChangePassword',
      header: 'Password change',
      render: (member) => member.mustChangePassword ? <Chip tone="warning">Pending</Chip> : '—',
    },
    {
      key: 'lastLoginAt',
      header: 'Last signed in',
      sortable: true,
      render: (member) => (
        <span className="text-sm text-secondary">{formatDateTime(member.lastLoginAt)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Added',
      sortable: true,
      render: (member) => (
        <span className="text-sm text-secondary">{formatDateTime(member.createdAt)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Admin team"
        description="Who can sign in to this panel, and what they can reach once they do."
        badge={loading ? null : <Chip tone="brand">{meta.total} total</Chip>}
        {...(canManage
          ? {
              actions: (
                <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
                  Add member
                </Button>
              ),
            }
          : {})}
      />

      <section className="card">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search the admin team"
            placeholder="Search by name or email"
          />

          <div className="toolbar__filters">
            <label className="sr-only" htmlFor="filter-admin-status">
              Filter by status
            </label>
            <select
              id="filter-admin-status"
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value as AdminStatus | '')}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {canSeeRoles ? (
              <>
                <label className="sr-only" htmlFor="filter-admin-role">
                  Filter by role
                </label>
                <select
                  id="filter-admin-role"
                  className="select"
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {hasFilters ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <DataTable
          caption="Administrators with access to this panel"
          columns={columns}
          rows={members}
          rowKey={(member) => member.id}
          loading={loading}
          error={error}
          onRetry={reload}
          sort={sort}
          onSortChange={setSort}
          empty={{
            title: hasFilters ? 'No members match these filters' : 'No administrators yet',
            message: hasFilters
              ? 'Try a different search term, or clear the filters to see everyone.'
              : 'Add the people who should be able to sign in to this panel.',
            ...(hasFilters ? { action: { label: 'Clear filters', onClick: clearFilters } } : {}),
          }}
          {...(canManage
            ? {
                rowActions: (member: AdminMember) =>
                  member.canManage ? (
                    <>
                      <IconButton
                        label={`Edit ${member.name}`}
                        icon={<EditIcon />}
                        onClick={() => setEditing(member)}
                      />
                      <IconButton
                        label={`Reset the password for ${member.name}`}
                        icon={<KeyIcon />}
                        onClick={() => setResetting(member)}
                      />
                      <IconButton
                        label={
                          member.status === 'active'
                            ? `Suspend ${member.name}`
                            : `Restore access for ${member.name}`
                        }
                        icon={<ShieldOffIcon />}
                        onClick={() => setChangingStatus(member)}
                      />
                    </>
                  ) : (
                    <span className="text-xs text-muted">Your account</span>
                  ),
              }
            : {})}
        />

        {!loading && !error ? (
          <Pagination meta={meta} noun="members" onPageChange={setPage} onLimitChange={setLimit} />
        ) : null}
      </section>

      {canManage ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <InlineAlert tone="info">
            An account is never deleted, only suspended — a suspended admin is signed out
            everywhere at once and cannot sign in, while the audit trail keeps naming a real
            account. Your own row has no actions: ask another administrator to change your role
            or your access.
          </InlineAlert>
        </div>
      ) : null}

      <MemberFormDrawer
        member={editing}
        open={creating || editing !== null}
        roles={roles}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={reload}
      />

      <ResetPasswordDrawer member={resetting} onClose={() => setResetting(null)} onSaved={reload} />

      <MemberStatusDialog
        member={changingStatus}
        onClose={() => setChangingStatus(null)}
        onChanged={reload}
      />
    </>
  );
}
