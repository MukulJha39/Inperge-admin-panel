import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  createAdminMember,
  resetAdminMemberPassword,
  updateAdminMember,
  updateAdminMemberStatus,
} from '../api/endpoints';
import type { AdminMember, RoleWithPermissions } from '../api/types';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Drawer } from '../components/Drawer';
import { SelectField, TextField } from '../components/Field';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';

/**
 * Generates a password that clears the API's rule on the first try.
 *
 * Built from `crypto.getRandomValues` rather than `Math.random`, and assembled so one
 * character of each required class is always present — a generator that sometimes
 * produces a rejected password is worse than no generator.
 */
function generatePassword(): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*?';
  const all = lower + upper + digits + symbols;

  const bytes = new Uint32Array(18);
  crypto.getRandomValues(bytes);

  const pick = (alphabet: string, index: number) =>
    alphabet.charAt((bytes[index] ?? 0) % alphabet.length);

  const required = [pick(lower, 0), pick(upper, 1), pick(digits, 2), pick(symbols, 3)];
  const rest = Array.from({ length: 12 }, (_, index) => pick(all, index + 4));
  const characters = [...required, ...rest];

  // Fisher-Yates, so the required characters do not always sit at the front.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = (bytes[index] ?? 0) % (index + 1);
    const a = characters[index];
    const b = characters[swap];
    if (a !== undefined && b !== undefined) {
      characters[index] = b;
      characters[swap] = a;
    }
  }

  return characters.join('');
}

/** The rule the API enforces, stated where the password is typed rather than after it fails. */
const PASSWORD_HINT = 'At least 12 characters, with an upper-case letter, a lower-case letter and a number.';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: string;
  /** Offers a generated password, for the two places an admin sets one for someone else. */
  generator?: boolean;
}

export function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete = 'new-password',
  generator = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="stack gap-2">
      <TextField
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        required
        {...(error ? { error } : {})}
        {...(hint && !error ? { hint } : {})}
      />
      <div className="row gap-2 wrap">
        <Button size="sm" variant="ghost" onClick={() => setVisible((current) => !current)}>
          {visible ? 'Hide' : 'Show'}
        </Button>
        {generator ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(generatePassword());
              setVisible(true);
            }}
          >
            Generate
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------- create and edit a member ------------------------ */

interface MemberFormDrawerProps {
  member: AdminMember | null;
  open: boolean;
  roles: RoleWithPermissions[];
  onClose: () => void;
  onSaved: () => void;
}

export function MemberFormDrawer({ member, open, roles, onClose, onSaved }: MemberFormDrawerProps) {
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(member?.name ?? '');
    setEmail(member?.email ?? '');
    setRoleId(member?.role.id ?? roles[0]?.id ?? '');
    setPassword('');
    setFormError(null);
    setFieldErrors({});
  }, [open, member, roles]);

  const roleOptions = useMemo(
    () => roles.map((role) => ({ value: role.id, label: role.name })),
    [roles],
  );

  const chosenRole = roles.find((role) => role.id === roleId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      if (member) {
        const result = await updateAdminMember(member.id, {
          name: name.trim(),
          email: email.trim(),
          roleId,
        });
        toast.success('Member updated', `${result.admin.name} is now ${result.admin.role.name}.`);
      } else {
        const result = await createAdminMember({
          name: name.trim(),
          email: email.trim(),
          roleId,
          password,
        });
        toast.success(
          'Member added',
          `${result.admin.name} can sign in with the password you set, and must change it straight away.`,
        );
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not save this member. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      busy={saving}
      title={member ? `Edit ${member.name}` : 'Add a team member'}
      description={
        member
          ? 'Changes to their role take effect on their next request.'
          : 'They sign in with this email address and the password you set here.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="member-form" loading={saving}>
            {member ? 'Save changes' : 'Add member'}
          </Button>
        </>
      }
    >
      <form id="member-form" className="stack gap-5" onSubmit={handleSubmit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <TextField
          label="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Priya Sharma"
          maxLength={80}
          autoComplete="off"
          required
          {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
        />

        <TextField
          label="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="priya@inperge.com"
          autoComplete="off"
          required
          hint="This is what they sign in with."
          {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
        />

        <SelectField
          label="Role"
          options={roleOptions}
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          required
          {...(chosenRole ? { hint: chosenRole.description } : {})}
          {...(fieldErrors.roleId ? { error: fieldErrors.roleId } : {})}
        />

        {member ? null : (
          <>
            <PasswordField
              label="Starting password"
              value={password}
              onChange={setPassword}
              generator
              hint={PASSWORD_HINT}
              {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
            />
            <InlineAlert tone="info">
              Share this with them however you normally would. They cannot use the panel until
              they replace it with a password of their own.
            </InlineAlert>
          </>
        )}
      </form>
    </Drawer>
  );
}

/* --------------------------- reset someone's password --------------------------- */

interface ResetPasswordDrawerProps {
  member: AdminMember | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ResetPasswordDrawer({ member, onClose, onSaved }: ResetPasswordDrawerProps) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!member) return;
    setPassword('');
    setFormError(null);
    setFieldErrors({});
  }, [member]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!member) return;

    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await resetAdminMemberPassword(member.id, password);
      toast.success(
        'Password reset',
        `${member.name} is signed out everywhere and must choose a new password.`,
      );
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not reset this password. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={member !== null}
      busy={saving}
      title={`Reset password for ${member?.name ?? ''}`}
      description="Every device they are signed in on is signed out at once."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="reset-form" loading={saving}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-form" className="stack gap-5" onSubmit={handleSubmit}>
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          generator
          hint={PASSWORD_HINT}
          {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
        />

        <InlineAlert tone="info">
          Give this to them directly. They must replace it the moment they sign in, so it never
          stays a working password for long.
        </InlineAlert>
      </form>
    </Drawer>
  );
}

/* ------------------------------ suspend / restore ----------------------------- */

interface MemberStatusDialogProps {
  member: AdminMember | null;
  onClose: () => void;
  onChanged: () => void;
}

export function MemberStatusDialog({ member, onClose, onChanged }: MemberStatusDialogProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const suspending = member?.status === 'active';

  async function handleConfirm() {
    if (!member) return;
    setBusy(true);
    try {
      await updateAdminMemberStatus(member.id, suspending ? 'suspended' : 'active');
      toast.success(
        suspending ? 'Access suspended' : 'Access restored',
        suspending
          ? `${member.name} is signed out everywhere and cannot sign in.`
          : `${member.name} can sign in again.`,
      );
      onChanged();
      onClose();
    } catch (error) {
      toast.error(
        'Could not change their access',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={member !== null}
      destructive={suspending}
      busy={busy}
      title={suspending ? `Suspend ${member?.name ?? ''}?` : `Restore access for ${member?.name ?? ''}?`}
      message={
        suspending
          ? 'They are signed out of every device immediately and cannot sign in again until someone restores their access. Nothing they did is removed.'
          : 'They will be able to sign in again with their existing password.'
      }
      confirmLabel={suspending ? 'Suspend access' : 'Restore access'}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
