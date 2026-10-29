import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  CATALOG_PERMISSIONS,
  ORDER_PERMISSIONS,
  PERMISSIONS,
  RELATIONSHIP_PERMISSIONS,
} from '../auth/permissions';
import { useCatalogMeta } from '../utils/useCatalogMeta';
import { AccountMenu } from './AccountMenu';
import { BrandMark } from './BrandMark';
import { IconButton } from './Button';
import {
  AccountIcon,
  AlertIcon,
  AuditIcon,
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  InboxIcon,
  MenuIcon,
  MerchantsIcon,
  MoneyIcon,
  OrdersIcon,
  PulseIcon,
  RolesIcon,
  SortIcon,
  TeamIcon,
} from './Icon';

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  /** Navigation only shows what the current role can actually open. */
  permissions?: string[];
}

interface NavSection {
  label: string;
  entries: NavEntry[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    entries: [{ to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> }],
  },
  {
    label: 'Operations',
    entries: [
      {
        to: '/merchants',
        label: 'Merchants',
        icon: <MerchantsIcon />,
        permissions: [PERMISSIONS.MERCHANT_VIEW],
      },
    ],
  },
  {
    label: 'Catalog',
    entries: [
      // { to: '/items', label: 'Products', icon: <InboxIcon size={18} />, permissions: [CATALOG_PERMISSIONS.ITEM_VIEW] },
      // {
      //   to: '/services',
      //   label: 'Services',
      //   icon: <AccountIcon />,
      //   permissions: [CATALOG_PERMISSIONS.SERVICE_VIEW],
      // },
      // {
      //   to: '/materials',
      //   label: 'Raw materials',
      //   icon: <InboxIcon size={18} />,
      //   permissions: [CATALOG_PERMISSIONS.MATERIAL_VIEW],
      // },
      {
        to: '/units',
        label: 'Units',
        icon: <PulseIcon size={18} />,
        permissions: [CATALOG_PERMISSIONS.ITEM_VIEW],
      },
      {
        to: '/low-stock',
        label: 'Needs attention',
        icon: <AlertIcon size={18} />,
        permissions: [CATALOG_PERMISSIONS.STOCK_VIEW],
      },
      {
        to: '/stock-activity',
        label: 'Stock activity',
        icon: <SortIcon size={18} />,
        permissions: [CATALOG_PERMISSIONS.STOCK_VIEW],
      },
    ],
  },
  {
    label: 'Relationships',
    entries: [
      {
        to: '/customers',
        label: 'Customers',
        icon: <AccountIcon />,
        permissions: [RELATIONSHIP_PERMISSIONS.CUSTOMER_VIEW],
      },
      {
        to: '/suppliers',
        label: 'Suppliers',
        icon: <InboxIcon size={18} />,
        permissions: [RELATIONSHIP_PERMISSIONS.SUPPLIER_VIEW],
      },
    ],
  },
  {
    label: 'Purchases & money',
    entries: [
      {
        to: '/orders',
        label: 'Orders',
        icon: <OrdersIcon />,
        permissions: [ORDER_PERMISSIONS.ORDER_VIEW],
      },
      {
        to: '/purchases',
        label: 'Purchases',
        icon: <SortIcon size={18} />,
        permissions: [RELATIONSHIP_PERMISSIONS.PURCHASE_VIEW],
      },
      {
        to: '/receivables',
        label: 'Receivables',
        icon: <MoneyIcon />,
        permissions: [ORDER_PERMISSIONS.PAYMENT_VIEW],
      },
      {
        to: '/installments',
        label: 'Instalments',
        icon: <CalendarIcon />,
        permissions: [ORDER_PERMISSIONS.INSTALLMENT_VIEW],
      },
      {
        to: '/payments',
        label: 'Payments',
        icon: <MoneyIcon />,
        permissions: [ORDER_PERMISSIONS.PAYMENT_VIEW],
      },
    ],
  },
  {
    label: 'Administration',
    entries: [
      { to: '/team', label: 'Admin team', icon: <TeamIcon />, permissions: [PERMISSIONS.ADMIN_VIEW] },
      { to: '/roles', label: 'Roles & permissions', icon: <RolesIcon />, permissions: [PERMISSIONS.ROLE_VIEW] },
      { to: '/audit', label: 'Audit history', icon: <AuditIcon />, permissions: [PERMISSIONS.AUDIT_VIEW] },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Loaded once at sign-in, so every screen labels quantities with the admin-managed units.
  useCatalogMeta();

  // Close the mobile navigation whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => !entry.permissions || can(...entry.permissions)),
  })).filter((section) => section.entries.length > 0);

  return (
    <div className="shell">
      <aside className={`sidebar${navOpen ? ' sidebar--open' : ''}`} aria-label="Main navigation">
        <div className="row-between">
          <div className="sidebar__brand">
            <BrandMark size={34} className="sidebar__mark" />
            <span className="stack">
              <span className="sidebar__name">Inperge</span>
              <span className="sidebar__tag">Admin panel</span>
            </span>
          </div>
          <span className="topbar__menu">
            <IconButton label="Close navigation" icon={<CloseIcon />} onClick={() => setNavOpen(false)} />
          </span>
        </div>

        <nav className="stack gap-5">
          {sections.map((section) => (
            <div key={section.label} className="nav-group">
              <div className="nav-group__label">{section.label}</div>
              <ul className="stack gap-1">
                {section.entries.map((entry) => (
                  <li key={entry.to}>
                    <NavLink
                      to={entry.to}
                      className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
                    >
                      <span aria-hidden="true" className="row">
                        {entry.icon}
                      </span>
                      {entry.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

      </aside>

      <div className="shell__main">
        <header className="topbar">
          {/* The bar reaches both edges; its contents keep to the page width below. */}
          <div className="topbar__inner">
            <div className="row gap-3">
              <span className="topbar__menu">
                <IconButton label="Open navigation" icon={<MenuIcon />} onClick={() => setNavOpen(true)} />
              </span>
              <span className="text-sm text-secondary">Internal operational control centre</span>
            </div>

            <AccountMenu />
          </div>
        </header>

        <main className="shell__content">{children}</main>
      </div>
    </div>
  );
}
