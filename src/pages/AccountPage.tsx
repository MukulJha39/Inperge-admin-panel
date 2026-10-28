import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { fetchAuditLogs, updateOwnProfile } from '../api/endpoints';
import type { AuditEntry } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { TextField } from '../components/Field';
import { AccountIcon, CalendarIcon, ClockIcon, LockIcon, RolesIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { formatAuditAction, formatDateTime } from '../utils/format';
import { ChangePasswordForm } from './ChangePasswordPage';

/**
 * The signed-in administrator's own account.
 *
 * A header identifying the account, then one section at a time. What the role may reach is
 * deliberately absent: it is identical for everyone holding that role and already has a
 * screen of its own.
 */

type TabId = 'details' | 'password' | 'activity';

/** How many of the admin's own actions the activity section shows. */
const ACTIVITY_LIMIT = 15;

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'details', label: 'Account info', icon: <AccountIcon size={16} /> },
  { id: 'password', label: 'Change password', icon: <LockIcon size={16} /> },
  { id: 'activity', label: 'Activity', icon: <ClockIcon size={16} /> },
];

/* --------------------------------- header --------------------------------- */

function ProfileHeader() {
  const { admin } = useAuth();
  if (!admin) return null;

  return (
    <header className="profile-head">
      <div className="profile-head__bar" aria-hidden="true" />

      <div className="profile-head__body">
        <Avatar name={admin.name} size="lg" />

        <div className="profile-head__identity">
          <h2 className="profile-head__name">{admin.name}</h2>
          <p className="profile-head__email truncate">{admin.email}</p>
          <div className="row gap-2 wrap">
            <Chip tone="brand">{admin.role.name}</Chip>
            <Chip tone={admin.status === 'active' ? 'success' : 'danger'} dot>
              {admin.status === 'active' ? 'Active' : 'Suspended'}
            </Chip>
          </div>
        </div>

        <dl className="profile-head__meta">
          <div className="profile-head__fact">
            <dt>
              <RolesIcon size={15} />
              Role
            </dt>
            <dd>{admin.role.name}</dd>
          </div>
          <div className="profile-head__fact">
            <dt>
              <CalendarIcon size={15} />
              Member since
            </dt>
            <dd>{formatDateTime(admin.createdAt)}</dd>
          </div>
        </dl>
      </div>
    </header>
  );
}

/* ------------------------------- account info ------------------------------ */

function AccountInfo() {
  const { admin, refreshProfile } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(admin?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Keep in step with the account when it is re-read, so a save elsewhere is reflected.
  useEffect(() => setName(admin?.name ?? ''), [admin?.name]);

  if (!admin) return null;

  const dirty = name.trim() !== admin.name;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await updateOwnProfile(name.trim());
      await refreshProfile();
      toast.success('Profile updated', 'Your display name has been changed.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error.message);
      } else {
        setFormError('Could not save your profile. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel-section" onSubmit={handleSubmit}>
      <h3 className="panel-section__label">Account details</h3>

      {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}

      <div className="field-grid">
        <TextField
          label="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="name"
          required
          {...(fieldErrors.name ? { error: fieldErrors.name } : {})}
        />

        <TextField
          label="Email address"
          value={admin.email}
          readOnly
          disabled
          hint="Your sign-in address. Changed by an administrator on the admin team screen."
        />

        <TextField
          label="Role"
          value={admin.role.name}
          readOnly
          disabled
          hint="Managed by an administrator."
        />

        <TextField
          label="Last signed in"
          value={formatDateTime(admin.lastLoginAt)}
          readOnly
          disabled
        />
      </div>

      {admin.role.description ? (
        <p className="panel-section__note">{admin.role.description}</p>
      ) : null}

      <div className="panel-section__actions">
        <Button variant="primary" type="submit" loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------- password -------------------------------- */

function PasswordSection() {
  const { admin, refreshProfile } = useAuth();
  if (!admin) return null;

  return (
    <div className="panel-section">
      <h3 className="panel-section__label">Change password</h3>
      <p className="panel-section__hint">
        {admin.passwordChangedAt
          ? `Last changed ${formatDateTime(admin.passwordChangedAt)}. Changing it signs you out of every other device.`
          : 'Never changed since this account was created. Changing it signs you out of every other device.'}
      </p>

      <div className="password-column">
        <ChangePasswordForm onChanged={refreshProfile} />
      </div>
    </div>
  );
}

/* --------------------------------- activity -------------------------------- */

function ActivitySection() {
  const { admin } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const adminId = admin?.id;

  useEffect(() => {
    if (!adminId) return;
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAuditLogs(
          { actorId: adminId, page: 1, limit: ACTIVITY_LIMIT },
          controller.signal,
        );
        if (!cancelled) setEntries(result.items);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load your activity. Please try again.',
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
  }, [adminId, reloadToken]);

  return (
    <div className="panel-section">
      <h3 className="panel-section__label">Your recent activity</h3>
      <p className="panel-section__hint">
        The last {ACTIVITY_LIMIT} things you did, as the audit history recorded them.
      </p>

      {loading ? (
        <div className="stack gap-4" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="stack gap-2">
              <Skeleton width="55%" height="13px" />
              <Skeleton width="30%" height="11px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadToken((token) => token + 1)} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          message="Actions you take in the panel are listed here as you take them."
          icon={<ClockIcon size={20} />}
        />
      ) : (
        <ul className="feed">
          {entries.map((entry, index) => (
            <li key={entry.id} className="feed__item" style={{ '--i': index } as React.CSSProperties}>
              <span className="feed__rail" aria-hidden="true">
                <span className="feed__dot" />
              </span>
              <div className="grow">
                <div className="feed__summary">{entry.summary}</div>
                <div className="feed__meta row gap-2 wrap">
                  <Chip mono>{formatAuditAction(entry.action)}</Chip>
                  <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                    {formatDateTime(entry.createdAt)}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------- page ---------------------------------- */

export function AccountPage() {
  const { admin } = useAuth();
  const [tab, setTab] = useState<TabId>('details');

  if (!admin) return null;

  return (
    <>
      <PageHeader title="My account" description="Your admin identity, your password and what you have been doing." />

      <ProfileHeader />

      <div className="segmented" role="tablist" aria-label="Account sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={entry.id === tab}
            aria-controls={`panel-${entry.id}`}
            className={`segmented__tab${entry.id === tab ? ' segmented__tab--active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            <span aria-hidden="true" className="row">
              {entry.icon}
            </span>
            {entry.label}
          </button>
        ))}
      </div>

      <section className="card" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'details' ? <AccountInfo /> : null}
        {tab === 'password' ? <PasswordSection /> : null}
        {tab === 'activity' ? <ActivitySection /> : null}
      </section>
    </>
  );
}
