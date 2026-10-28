import type { CSSProperties, ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { AuditIcon, MerchantsIcon, OrdersIcon } from './Icon';

const HIGHLIGHTS = [
  { icon: <MerchantsIcon size={18} />, title: 'Merchants & catalog', text: 'Onboard sellers and keep listings in shape.' },
  { icon: <OrdersIcon size={18} />, title: 'Orders & payments', text: 'Track every order and settlement in one view.' },
  { icon: <AuditIcon size={18} />, title: 'Full audit trail', text: 'Every admin action is recorded and reviewable.' },
];

/** Position in the staggered entrance animation. */
const step = (index: number) => ({ '--i': index }) as CSSProperties;

interface AuthLayoutProps {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * The split sign-in screen: a brand panel on the left (hidden on small screens) and the
 * form on the right. Shared by the login page and the forced change-password gate.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth">
      <aside className="auth__aside" aria-hidden="true">
        <span className="auth__orb auth__orb--one" />
        <span className="auth__orb auth__orb--two" />
        <span className="auth__orb auth__orb--three" />
        <span className="auth__grid" />

        <div className="auth__aside-top auth__reveal" style={step(0)}>
          <BrandMark size={44} className="auth__aside-mark" />
          <span className="stack">
            <span className="auth__aside-name">Inperge</span>
            <span className="auth__aside-tag">Admin panel</span>
          </span>
        </div>

        <div className="auth__aside-body">
          <div className="auth__hero-logo auth__reveal" style={step(1)}>
            <BrandMark size={132} />
          </div>
          <h2 className="auth__headline auth__reveal" style={step(2)}>
            Run the whole marketplace
            <br />
            <span className="auth__headline-accent">from one place.</span>
          </h2>
          <ul className="auth__highlights">
            {HIGHLIGHTS.map((item, index) => (
              <li key={item.title} className="auth__highlight auth__reveal" style={step(3 + index)}>
                <span className="auth__highlight-icon">{item.icon}</span>
                <span className="stack">
                  <span className="auth__highlight-title">{item.title}</span>
                  <span className="auth__highlight-text">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth__aside-foot auth__reveal" style={step(6)}>
          © {new Date().getFullYear()} Inperge · Internal use only
        </p>
      </aside>

      <main className="auth__main">
        <div className="auth__card">
          <div className="auth__brand auth__reveal" style={step(0)}>
            <BrandMark size={40} />
            <span className="stack">
              <span className="sidebar__name">Inperge</span>
              <span className="sidebar__tag">Admin panel</span>
            </span>
          </div>

          <h1 className="auth__title auth__reveal" style={step(1)}>
            {title}
          </h1>
          <p className="auth__subtitle auth__reveal" style={step(2)}>
            {subtitle}
          </p>

          <div className="auth__reveal" style={step(3)}>
            {children}
          </div>

          {footer ? (
            <div className="auth__reveal" style={step(4)}>
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
