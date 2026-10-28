import type { ReactNode } from 'react';
import type { MerchantStatus } from '../api/types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

interface ChipProps {
  tone?: Tone;
  /** Shows a leading dot so status never relies on colour alone (PRD section 23). */
  dot?: boolean;
  mono?: boolean;
  children: ReactNode;
}

export function Chip({ tone = 'neutral', dot = false, mono = false, children }: ChipProps) {
  const classes = ['chip', tone !== 'neutral' ? `chip--${tone}` : '', mono ? 'chip--code' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {dot ? <span className="chip__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const MERCHANT_STATUS_TONE: Record<MerchantStatus, Tone> = {
  active: 'success',
  suspended: 'danger',
};

const MERCHANT_STATUS_LABEL: Record<MerchantStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
};

export function MerchantStatusChip({ status }: { status: MerchantStatus }) {
  return (
    <Chip tone={MERCHANT_STATUS_TONE[status]} dot>
      {MERCHANT_STATUS_LABEL[status]}
    </Chip>
  );
}

export function PermissionPill({ permission, granted }: { permission: string; granted: boolean }) {
  return (
    <span className={`permission${granted ? ' permission--granted' : ''}`} title={permission}>
      {permission}
    </span>
  );
}
