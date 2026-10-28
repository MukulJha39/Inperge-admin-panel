import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { createRole, updateRole } from '../api/endpoints';
import type { PermissionGroup, RoleWithPermissions } from '../api/types';
import { describePermission } from '../auth/permissions';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';

interface RoleFormDrawerProps {
  /** The role being edited, or null when the drawer is creating one. */
  role: RoleWithPermissions | null;
  open: boolean;
  groups: PermissionGroup[];
  /**
   * Shows the role without offering to change it.
   *
   * The seeded super administrator role cannot be edited, and the list no longer prints
   * permissions, so without this there would be no way to see what it actually holds.
   */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (role: RoleWithPermissions) => void;
}

/**
 * Create or edit a role.
 *
 * The permission picker is the whole point of the screen, so it is grouped exactly as the
 * server groups the catalogue, and every group can be taken or dropped in one go — a role
 * is usually "everything about orders, nothing about admins" rather than a hand-picked
 * list of thirty keys.
 */
export function RoleFormDrawer({
  role,
  open,
  groups,
  readOnly = false,
  onClose,
  onSaved,
}: RoleFormDrawerProps) {
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset to the role being opened, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setPermissions(new Set(role?.permissions ?? []));
    setFormError(null);
    setFieldErrors({});
  }, [open, role]);

  const totalPermissions = useMemo(
    () => groups.reduce((sum, group) => sum + group.permissions.length, 0),
    [groups],
  );

  function toggle(permission: string) {
    if (readOnly) return;
    setPermissions((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, grantAll: boolean) {
    if (readOnly) return;
    setPermissions((current) => {
      const next = new Set(current);
      for (const permission of group.permissions) {
        if (grantAll) next.add(permission);
        else next.delete(permission);
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    const input = {
      name: name.trim(),
      description: description.trim(),
      permissions: [...permissions],
    };

    try {
      const result = role
        ? await updateRole(role.id, input)
        : await createRole(input);
      toast.success(
        role ? 'Role updated' : 'Role created',
        `${result.role.name} now holds ${result.role.permissions.length} permission${result.role.permissions.length === 1 ? '' : 's'}.`,
      );
      onSaved(result.role);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not save this role. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  const chosen = permissions.size;

  return (
    <Drawer
      open={open}
      wide
      busy={saving}
      title={readOnly ? (role?.name ?? 'Role') : role ? `Edit ${role.name}` : 'New role'}
      description={
        readOnly
          ? 'This role is fixed, so it is shown here rather than offered for editing.'
          : role
            ? 'Changes apply the next time anyone holding this role makes a request.'
            : 'Give the role a name, say what it is for, then choose what it can reach.'
      }
      onClose={onClose}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="role-form" loading={saving}>
              {role ? 'Save changes' : 'Create role'}
            </Button>
          </>
        )
      }
    >
      <form id="role-form" className="stack gap-5" onSubmit={handleSubmit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <TextField
          label="Role name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Regional support lead"
          maxLength={80}
          required
          readOnly={readOnly}
          disabled={readOnly}
          {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
        />

        <TextField
          label="What is this role for?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Handles merchant queries for the western region."
          maxLength={300}
          required
          readOnly={readOnly}
          disabled={readOnly}
          {...(fieldErrors.description ? { error: fieldErrors.description } : {})}
        />

        <div className="stack gap-3">
          <div className="row-between">
            <span className="field__label" style={{ marginBottom: 0 }}>
              Permissions
            </span>
            <span className="text-xs text-muted text-numeric">
              {chosen} of {totalPermissions} chosen
            </span>
          </div>

          {fieldErrors.permissions ? (
            <InlineAlert tone="error">{fieldErrors.permissions}</InlineAlert>
          ) : null}

          <div className="perm-editor">
            {groups.map((group) => {
              const granted = group.permissions.filter((permission) => permissions.has(permission));
              const allGranted = granted.length === group.permissions.length;

              return (
                <fieldset key={group.group} className="perm-group">
                  <legend className="sr-only">{group.group}</legend>

                  <div className="perm-group__head">
                    <span className="perm-group__name">{group.group}</span>
                    <span className="perm-group__count text-numeric">
                      {granted.length}/{group.permissions.length}
                    </span>
                    {readOnly ? null : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => toggleGroup(group, !allGranted)}
                      >
                        {allGranted ? 'Clear group' : 'Select all'}
                      </button>
                    )}
                  </div>

                  <div className="perm-group__items">
                    {group.permissions.map((permission) => (
                      <label key={permission} className="perm-check">
                        <input
                          type="checkbox"
                          checked={permissions.has(permission)}
                          disabled={readOnly}
                          onChange={() => toggle(permission)}
                        />
                        <span className="perm-check__body">
                          <span className="perm-check__label">{describePermission(permission)}</span>
                          <span className="perm-check__key text-mono">{permission}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
      </form>
    </Drawer>
  );
}
