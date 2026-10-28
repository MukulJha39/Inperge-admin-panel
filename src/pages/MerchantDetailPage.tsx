import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { fetchAuditLogs, fetchMerchant } from '../api/endpoints';
import { ERROR_CODES, type AuditEntry, type Merchant } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  CATALOG_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  RELATIONSHIP_PERMISSIONS,
} from '../auth/permissions';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Chip, MerchantStatusChip } from '../components/Chip';
import { EditIcon, LockIcon, ShieldOffIcon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../components/States';
import { TabPanel, Tabs } from '../components/Tabs';
import {
  formatAuditAction,
  formatAuditValue,
  formatDateTime,
  formatPhone,
  genderLabel,
} from '../utils/format';
import {
  MerchantBusinessPanel,
  MerchantItemsPanel,
  MerchantMaterialsPanel,
  MerchantServicesPanel,
  MerchantStockPanel,
} from './MerchantCatalogTabs';
import {
  MerchantCustomersPanel,
  MerchantPurchasesPanel,
  MerchantRelationshipSummaryCard,
  MerchantSuppliersPanel,
} from './MerchantRelationshipTabs';
import {
  MerchantInstallmentsPanel,
  MerchantOrderSummaryCard,
  MerchantOrdersPanel,
  MerchantPaymentsPanel,
  MerchantReceivablesPanel,
} from './MerchantOrderTabs';
import { MerchantFormDrawer } from './MerchantFormDrawer';
import { MerchantStatusDialog } from './MerchantStatusDialog';

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="summary-item">
      <div className="summary-item__label">{label}</div>
      <div className="summary-item__value">{children}</div>
    </div>
  );
}

export function MerchantDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { can } = useAuth();

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [activeTab, setActiveTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const canViewActivity = can(PERMISSIONS.AUDIT_VIEW);
  const canViewBusiness = can(CATALOG_PERMISSIONS.BUSINESS_VIEW);
  const canViewItems = can(CATALOG_PERMISSIONS.ITEM_VIEW);
  const canViewServices = can(CATALOG_PERMISSIONS.SERVICE_VIEW);
  const canViewMaterials = can(CATALOG_PERMISSIONS.MATERIAL_VIEW);
  const canViewStock = can(CATALOG_PERMISSIONS.STOCK_VIEW);
  const canViewCustomers = can(RELATIONSHIP_PERMISSIONS.CUSTOMER_VIEW);
  const canViewSuppliers = can(RELATIONSHIP_PERMISSIONS.SUPPLIER_VIEW);
  const canViewPurchases = can(RELATIONSHIP_PERMISSIONS.PURCHASE_VIEW);
  const canViewOrders = can(ORDER_PERMISSIONS.ORDER_VIEW);
  const canViewPayments = can(ORDER_PERMISSIONS.PAYMENT_VIEW);
  const canViewInstallments = can(ORDER_PERMISSIONS.INSTALLMENT_VIEW);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const { merchant: record } = await fetchMerchant(id, controller.signal);
        if (!cancelled) setMerchant(record);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        if (requestError instanceof ApiError && requestError.code === ERROR_CODES.NOT_FOUND) {
          setNotFound(true);
        } else {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : 'Could not load this merchant. Please try again.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, reloadToken]);

  // The activity timeline is only fetched when its tab is actually opened.
  useEffect(() => {
    if (activeTab !== 'activity' || !canViewActivity || !merchant) return;

    const controller = new AbortController();
    let cancelled = false;

    async function loadActivity() {
      setActivityLoading(true);
      setActivityError(null);
      try {
        const result = await fetchAuditLogs(
          { targetType: 'merchant', targetId: id, limit: 50 },
          controller.signal,
        );
        if (!cancelled) setActivity(result.items);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setActivityError(
          requestError instanceof ApiError
            ? requestError.message
            : 'Could not load the activity history.',
        );
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    }

    void loadActivity();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, canViewActivity, id, merchant, reloadToken]);

  const handleUpdated = useCallback((updated: Merchant) => {
    setMerchant(updated);
    setReloadToken((token) => token + 1);
  }, []);

  if (notFound) {
    return (
      <>
        <PageHeader title="Merchant not found" breadcrumbs={[{ label: 'Merchants', to: '/merchants' }]} />
        <section className="card">
          <EmptyState
            title="This merchant does not exist"
            message="The record may have been removed, or the link may be incorrect. Go back to the merchants list and search again."
          />
        </section>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Merchant" breadcrumbs={[{ label: 'Merchants', to: '/merchants' }]} />
        <section className="card">
          <div className="card__body stack gap-5">
            <Skeleton width="220px" height="20px" />
            <div className="summary-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="stack gap-2">
                  <Skeleton width="80px" height="10px" />
                  <Skeleton width="140px" height="14px" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  if (error || !merchant) {
    return (
      <>
        <PageHeader title="Merchant" breadcrumbs={[{ label: 'Merchants', to: '/merchants' }]} />
        <section className="card">
          <ErrorState
            message={error ?? 'Could not load this merchant.'}
            onRetry={() => setReloadToken((token) => token + 1)}
          />
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={merchant.fullName}
        breadcrumbs={[{ label: 'Merchants', to: '/merchants' }, { label: merchant.fullName }]}
        badge={<MerchantStatusChip status={merchant.status} />}
        actions={
          <>
            {can(PERMISSIONS.MERCHANT_EDIT) ? (
              <Button icon={<EditIcon />} onClick={() => setEditing(true)}>
                Edit details
              </Button>
            ) : null}
            {can(PERMISSIONS.MERCHANT_SUSPEND) ? (
              <Button
                variant={merchant.status === 'active' ? 'danger-outline' : 'primary'}
                icon={<ShieldOffIcon />}
                onClick={() => setChangingStatus(true)}
              >
                {merchant.status === 'active' ? 'Suspend' : 'Reactivate'}
              </Button>
            ) : null}
          </>
        }
      />

      <section className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="card__body">
          <div className="row gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <Avatar name={merchant.fullName} photoUrl={merchant.photoUrl} size="lg" />
            <div className="stack gap-1">
              <h2>{merchant.fullName}</h2>
              <div className="row gap-3 wrap">
                <span className="text-mono text-sm text-secondary">
                  {formatPhone(merchant.countryCode, merchant.phone)}
                </span>
                <Chip dot tone="brand">
                  <LockIcon size={11} /> Verified phone
                </Chip>
              </div>
            </div>
          </div>

          <div className="summary-grid">
            <SummaryItem label="Status">
              <MerchantStatusChip status={merchant.status} />
            </SummaryItem>
            <SummaryItem label="Gender">{genderLabel(merchant.gender)}</SummaryItem>
            <SummaryItem label="Phone verified">{formatDateTime(merchant.phoneVerifiedAt)}</SummaryItem>
            <SummaryItem label="Registered">{formatDateTime(merchant.createdAt)}</SummaryItem>
            <SummaryItem label="Last signed in">{formatDateTime(merchant.lastLoginAt)}</SummaryItem>
            <SummaryItem label="Language">
              <Chip mono>{merchant.locale}</Chip>
            </SummaryItem>
            <SummaryItem label="Appearance">
              <Chip mono>{merchant.themeMode}</Chip>
            </SummaryItem>
            <SummaryItem label="Profile photo">
              {merchant.photoUrl ? 'Uploaded' : 'Not uploaded (optional)'}
            </SummaryItem>
          </div>
        </div>
      </section>

      {canViewCustomers || canViewSuppliers || canViewPurchases ? (
        <MerchantRelationshipSummaryCard merchantId={id} />
      ) : null}

      {canViewOrders ? <MerchantOrderSummaryCard merchantId={id} /> : null}

      <Tabs
        label="Merchant sections"
        activeId={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'business', label: 'Business', hidden: !canViewBusiness },
          { id: 'items', label: 'Products', hidden: !canViewItems },
          { id: 'services', label: 'Services', hidden: !canViewServices },
          { id: 'materials', label: 'Raw materials', hidden: !canViewMaterials },
          { id: 'stock', label: 'Stock activity', hidden: !canViewStock },
          { id: 'customers', label: 'Customers', hidden: !canViewCustomers },
          { id: 'suppliers', label: 'Suppliers', hidden: !canViewSuppliers },
          { id: 'purchases', label: 'Purchases', hidden: !canViewPurchases },
          { id: 'orders', label: 'Orders', hidden: !canViewOrders },
          { id: 'receivables', label: 'Receivables', hidden: !canViewPayments },
          { id: 'installments', label: 'Instalments', hidden: !canViewInstallments },
          { id: 'payments', label: 'Payments', hidden: !canViewPayments },
          { id: 'activity', label: 'Account history', hidden: !canViewActivity },
        ]}
      />

      <TabPanel id="profile" activeId={activeTab}>
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Identity</h3>
          </div>
          <div className="card__body stack gap-5">
            <InlineAlert tone="info">
              The verified phone number is this merchant&apos;s identity anchor. It is captured once during phone
              verification and can never be changed — not in the app, and not from here.
            </InlineAlert>

            <div className="summary-grid">
              <SummaryItem label="First name">{merchant.firstName}</SummaryItem>
              <SummaryItem label="Last name">{merchant.lastName}</SummaryItem>
              <SummaryItem label="Gender">{genderLabel(merchant.gender)}</SummaryItem>
              <SummaryItem label="Country code">
                <span className="text-mono">{merchant.countryCode}</span>
              </SummaryItem>
              <SummaryItem label="Phone number">
                <span className="text-mono">{merchant.phone}</span>
              </SummaryItem>
              <SummaryItem label="Full number">
                <span className="text-mono">{merchant.phoneE164}</span>
              </SummaryItem>
            </div>
          </div>
        </section>
      </TabPanel>

      <TabPanel id="business" activeId={activeTab}>
        <MerchantBusinessPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="items" activeId={activeTab}>
        <MerchantItemsPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="services" activeId={activeTab}>
        <MerchantServicesPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="materials" activeId={activeTab}>
        <MerchantMaterialsPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="stock" activeId={activeTab}>
        <MerchantStockPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="customers" activeId={activeTab}>
        <MerchantCustomersPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="suppliers" activeId={activeTab}>
        <MerchantSuppliersPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="purchases" activeId={activeTab}>
        <MerchantPurchasesPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="orders" activeId={activeTab}>
        <MerchantOrdersPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="receivables" activeId={activeTab}>
        <MerchantReceivablesPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="installments" activeId={activeTab}>
        <MerchantInstallmentsPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="payments" activeId={activeTab}>
        <MerchantPaymentsPanel merchantId={id} />
      </TabPanel>

      <TabPanel id="activity" activeId={activeTab}>
        <section className="card">
          <div className="card__header">
            <h3 className="card__title">Activity history</h3>
            <span className="text-sm text-muted">Most recent first</span>
          </div>
          <div className="card__body">
            {activityLoading ? (
              <div className="stack gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="stack gap-2">
                    <Skeleton width="60%" height="14px" />
                    <Skeleton width="30%" height="10px" />
                  </div>
                ))}
              </div>
            ) : activityError ? (
              <ErrorState message={activityError} onRetry={() => setReloadToken((token) => token + 1)} />
            ) : activity.length === 0 ? (
              <EmptyState
                title="No recorded activity yet"
                message="Registrations, sign-ins, profile changes and status changes appear here as they happen."
              />
            ) : (
              <div className="timeline">
                {activity.map((entry) => (
                  <div key={entry.id} className="timeline__item">
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <div className="timeline__summary">{entry.summary}</div>
                      <div className="timeline__meta">
                        {formatAuditAction(entry.action)} · {entry.actorLabel} ({entry.actorType}) ·{' '}
                        {formatDateTime(entry.createdAt)}
                      </div>
                      {entry.changes.length > 0 ? (
                        <div className="timeline__changes">
                          {entry.changes.map((change) => (
                            <span key={change.field} className="timeline__change">
                              {change.field}: {formatAuditValue(change.from)} → {formatAuditValue(change.to)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </TabPanel>

      <MerchantFormDrawer
        merchant={editing ? merchant : null}
        onClose={() => setEditing(false)}
        onSaved={handleUpdated}
      />

      <MerchantStatusDialog
        merchant={changingStatus ? merchant : null}
        onClose={() => setChangingStatus(false)}
        onChanged={handleUpdated}
      />
    </>
  );
}
