import { useState } from 'react';
import { ApiError } from '../api/client';
import { changeOwnPassword } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/States';
import { useToast } from '../components/Toast';
import { PasswordField } from './TeamDrawers';

/**
 * Choosing a password of your own.
 *
 * Shown as a full screen with no navigation when `mustChangePassword` is set, because at
 * that point the API refuses every other admin endpoint anyway — offering a panel whose
 * every link returns 403 would only be confusing. The same form is reused on the account
 * screen for a voluntary change.
 */

const PASSWORD_HINT =
  'At least 12 characters, with an upper-case letter, a lower-case letter and a number.';

interface ChangePasswordFormProps {
  /** Shown above the form when the change is being required rather than chosen. */
  forced?: boolean;
  onChanged: () => void | Promise<void>;
}

export function ChangePasswordForm({ forced = false, onChanged }: ChangePasswordFormProps) {
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    // Checked here as well as on the server, so a typo costs no round trip.
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'This does not match the new password.' });
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success('Password changed', 'Every other device has been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await onChanged();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not change your password. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack gap-5" onSubmit={handleSubmit}>
      {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

      {forced ? (
        <InlineAlert tone="warning">
          Your password was set by another administrator. Choose one only you know before
          using the panel.
        </InlineAlert>
      ) : null}

      <PasswordField
        label={forced ? 'The password you were given' : 'Current password'}
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        {...(fieldErrors.currentPassword ? { error: fieldErrors.currentPassword } : {})}
      />

      <PasswordField
        label="New password"
        value={newPassword}
        onChange={setNewPassword}
        hint={PASSWORD_HINT}
        {...(fieldErrors.newPassword ? { error: fieldErrors.newPassword } : {})}
      />

      <PasswordField
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        {...(fieldErrors.confirmPassword ? { error: fieldErrors.confirmPassword } : {})}
      />

      <InlineAlert tone="info">
        Changing your password signs you out of every other device. This tab stays signed in.
      </InlineAlert>

      <div>
        <Button variant="primary" type="submit" loading={saving}>
          Change password
        </Button>
      </div>
    </form>
  );
}

/** The full-screen gate an admin sees before they are allowed anywhere else. */
export function ChangePasswordGate() {
  const { admin, refreshProfile, signOut } = useAuth();

  return (
    <AuthLayout
      title="Choose a password"
      subtitle={
        <>
          {admin ? `Signed in as ${admin.email}. ` : ''}
          You need a password of your own before the panel will open.
        </>
      }
      footer={
        <p className="auth__hint">
          Wrong account?{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </p>
      }
    >
      <ChangePasswordForm forced onChanged={refreshProfile} />
    </AuthLayout>
  );
}
