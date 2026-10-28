import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteRole, fetchRoles } from '../api/endpoints';
import type { PermissionGroup, RoleWithPermissions } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PERMISSIONS } from '../auth/permissions';
import { Button, IconButton } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { EditIcon, EyeIcon, PlusIcon, TrashIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { RoleFormDrawer } from './RoleFormDrawer';

/**
 * The roles an admin account can hold.
 *
 * A list rather than a tab per role: the question this screen answers first is which roles
 * exist and who holds them, which is a comparison across roles, not a tour of one at a
 * time. What each role actually reaches is a long list of keys, so it lives in the drawer
 * where it can be read — and changed — rather than spread down the page.
 *
 * The seeded super administrator role cannot be edited: it is what gets the panel back if
 * another role is left unable to manage admins or permissions. Because the list no longer
 * prints permissions, that role opens the same drawer read-only, so it can still be read.
 */
export function RolesPage() {
  const { admin, can } = useAuth();
  const toast = useToast();

  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [editing, setEditing] = useState<RoleWithPermissions | null>(null);
  const [viewing, setViewing] = useState<RoleWithPermissions | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleWithPermissions | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const canManage = can(PERMISSIONS.ROLE_MANAGE);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchRoles(controller.signal);
        if (cancelled) return;
        setRoles(result.roles);
        setGroups(result.permissionGroups);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setRoles([]);
        setError(
          requestError instanceof ApiError ? requestError.message : 'Could not load roles. Please try again.',
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
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const totalPermissions = useMemo(
    () => groups.reduce((total, group) => total + group.permissions.length, 0),
    [groups],
  );

  async function handleDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteRole(deleting.id);
      toast.success('Role deleted', `${deleting.name} is no longer available.`);
      setDeleting(null);
      reload();
    } catch (deleteError) {
      toast.error(
        'Could not delete this role',
        deleteError instanceof ApiError ? deleteError.message : 'Please try again.',
      );
    } finally {
      setDeletingBusy(false);
    }
  }

  const columns: Column<RoleWithPermissions>[] = [
    {
      key: 'name',
      header: 'Role',
      grow: true,
      render: (role) => (
        <span className="text-medium" title={role.name}>{role.name}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (role) => <span className="text-xs text-muted" title={role.description}>{role.description || '—'}</span>,
    },
    {
      key: 'permissions',
      header: 'Granted permissions',
      numeric: true,
      render: (role) => (
        <span className="text-numeric" title={`${role.permissions.length} of ${totalPermissions}`}>{role.permissions.length}</span>
      ),
    },
    {
      key: 'totalPermissions',
      header: 'Available permissions',
      numeric: true,
      render: () => <span className="text-numeric">{totalPermissions}</span>,
    },
    {
      key: 'memberCount',
      header: 'Members',
      numeric: true,
      render: (role) => (
        <span className="text-numeric">
          {role.memberCount === 0 ? <span className="text-muted">None</span> : role.memberCount}
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (role) => <Chip tone={role.isSystem ? 'info' : 'neutral'}>{role.isSystem ? 'System' : 'Custom'}</Chip>,
    },
    {
      key: 'currentRole',
      header: 'Current role',
      render: (role) => admin?.role.slug === role.slug ? <Chip tone="brand" dot>Yours</Chip> : '—',
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each admin role can reach. Permissions are enforced by the API on every request, not just hidden in this panel."
        badge={loading ? null : <Chip tone="brand">{roles.length} roles</Chip>}
        {...(canManage && !loading && !error
          ? {
              actions: (
                <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
                  New role
                </Button>
              ),
            }
          : {})}
      />

      <section className="card">
        <DataTable
          caption="Admin roles and what they hold"
          columns={columns}
          rows={roles}
          rowKey={(role) => role.id}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={{
            title: 'No roles yet',
            message: 'Create a role to describe what a group of administrators may reach.',
            ...(canManage ? { action: { label: 'New role', onClick: () => setCreating(true) } } : {}),
          }}
          rowActions={(role) =>
            canManage && role.editable ? (
              <>
                <IconButton
                  label={`Edit ${role.name}`}
                  icon={<EditIcon />}
                  onClick={() => setEditing(role)}
                />
                {role.deletable ? (
                  <IconButton
                    label={`Delete ${role.name}`}
                    icon={<TrashIcon />}
                    onClick={() => setDeleting(role)}
                  />
                ) : null}
              </>
            ) : (
              // A role this admin cannot change is still worth reading.
              <IconButton
                label={`View permissions for ${role.name}`}
                icon={<EyeIcon />}
                onClick={() => setViewing(role)}
              />
            )
          }
        />
      </section>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <InlineAlert tone="info">
          Open a role to see exactly which permissions it holds. The super administrator role is
          fixed — it is what gets the panel back if another role is left unable to manage admins
          or permissions — so it can be read but not changed.
        </InlineAlert>
      </div>

      <RoleFormDrawer
        role={editing}
        open={creating || editing !== null}
        groups={groups}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={reload}
      />

      <RoleFormDrawer
        role={viewing}
        open={viewing !== null}
        groups={groups}
        readOnly
        onClose={() => setViewing(null)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={deleting !== null}
        destructive
        busy={deletingBusy}
        title={`Delete ${deleting?.name ?? 'this role'}?`}
        message="Nobody holds this role, so deleting it changes no one's access. This cannot be undone."
        confirmLabel="Delete role"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
