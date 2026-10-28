interface IconProps {
  size?: number;
  className?: string;
}

/**
 * One inline icon set. Icons are decorative by default: the element that uses them
 * supplies the accessible name (PRD section 23).
 */
function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...(className ? { className } : {}),
  };
}

export const SearchIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.5 13.5 3 3" />
  </svg>
);

export const CloseIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);

export const ChevronLeftIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 4 6 10l6 6" />
  </svg>
);

export const ChevronRightIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="m8 4 6 6-6 6" />
  </svg>
);

export const ChevronDownIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="m4 7 6 6 6-6" />
  </svg>
);

export const SortIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 3v14M6 7l4-4 4 4M6 13l4 4 4-4" />
  </svg>
);

export const SortAscIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 16V4M6 8l4-4 4 4" />
  </svg>
);

export const SortDescIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 4v12M6 12l4 4 4-4" />
  </svg>
);

export const CheckIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="m4 10.5 4 4 8-9" />
  </svg>
);

export const AlertIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 2.5 18 17H2z" />
    <path d="M10 8v4M10 14.5h.01" />
  </svg>
);

export const InfoIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v5M10 6.5h.01" />
  </svg>
);

export const LockIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="4" y="9" width="12" height="8" rx="2" />
    <path d="M7 9V7a3 3 0 0 1 6 0v2" />
  </svg>
);

export const MerchantsIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 7h14l-1 10H4z" />
    <path d="M7 7V5a3 3 0 0 1 6 0v2" />
  </svg>
);

export const RolesIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 2.5 16.5 5v5c0 3.5-2.6 6.6-6.5 7.5C6.1 16.6 3.5 13.5 3.5 10V5z" />
    <path d="m7.5 10 2 2 3.5-3.5" />
  </svg>
);

export const AuditIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M5 2.5h7l3 3v12H5z" />
    <path d="M8 9h4M8 12.5h4" />
  </svg>
);

export const AccountIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="10" cy="7" r="3" />
    <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" />
  </svg>
);

export const LogoutIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M12 6V4H4v12h8v-2" />
    <path d="M8 10h9m0 0-2.5-2.5M17 10l-2.5 2.5" />
  </svg>
);

export const MenuIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 6h14M3 10h14M3 14h14" />
  </svg>
);

export const InboxIcon = ({ size = 20, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M2.5 11.5 5 4h10l2.5 7.5v4a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
    <path d="M2.5 11.5h4l1 2h5l1-2h4" />
  </svg>
);

export const EditIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M13.5 3.5l3 3L8 15H5v-3z" />
  </svg>
);

export const ShieldOffIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 2.5 16.5 5v5c0 3.5-2.6 6.6-6.5 7.5C6.1 16.6 3.5 13.5 3.5 10V5z" />
    <path d="m7 13 6-6" />
  </svg>
);

export const OrdersIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M6 3.5h8a1 1 0 0 1 1 1v12l-2.5-1.5L10 16.5 7.5 15 5 16.5v-12a1 1 0 0 1 1-1z" />
    <path d="M7.5 7h5M7.5 10h5" />
  </svg>
);

export const MoneyIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="2.5" y="5.5" width="15" height="9" rx="1.5" />
    <circle cx="10" cy="10" r="2" />
  </svg>
);

export const CalendarIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
    <path d="M3 8h14M7 3v3M13 3v3" />
  </svg>
);

/* ------------------------------ dashboard ------------------------------ */

export const DashboardIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="2.5" y="2.5" width="6.5" height="7.5" rx="1.5" />
    <rect x="11" y="2.5" width="6.5" height="4.5" rx="1.5" />
    <rect x="2.5" y="12" width="6.5" height="5.5" rx="1.5" />
    <rect x="11" y="9" width="6.5" height="8.5" rx="1.5" />
  </svg>
);

export const ArrowRightIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3.5 10h13m0 0-4.5-4.5M16.5 10 12 14.5" />
  </svg>
);

export const TrendUpIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 13.5 8 8.5l3 3 5.5-5.5" />
    <path d="M12.5 6h4v4" />
  </svg>
);

export const TrendDownIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M3 6.5 8 11.5l3-3 5.5 5.5" />
    <path d="M12.5 14h4v-4" />
  </svg>
);

export const RefreshIcon = ({ size = 15, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
    <path d="M16.5 3v4h-4" />
  </svg>
);

export const ClockIcon = ({ size = 14, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6v4.3l2.8 1.7" />
  </svg>
);

export const PulseIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M2.5 10h3.2l2-5 3 10 2.3-5h4.5" />
  </svg>
);

/* --------------------------- roles & the admin team --------------------------- */

export const PlusIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const TrashIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6" />
  </svg>
);

export const KeyIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="7" cy="10" r="3.2" />
    <path d="M10.2 10H17m-2.5 0v2.5" />
  </svg>
);

export const TeamIcon = ({ size = 18, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <circle cx="7.5" cy="7" r="2.6" />
    <path d="M2.8 16c0-2.5 2.1-4.2 4.7-4.2s4.7 1.7 4.7 4.2" />
    <path d="M13.2 5.1a2.6 2.6 0 0 1 0 4.8M14.4 11.9c1.7.5 2.8 1.9 2.8 4.1" />
  </svg>
);

export const EyeIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M1.8 10S4.8 4.8 10 4.8 18.2 10 18.2 10 15.2 15.2 10 15.2 1.8 10 1.8 10z" />
    <circle cx="10" cy="10" r="2.4" />
  </svg>
);

export const EyeOffIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M8.2 5a8.6 8.6 0 0 1 1.8-.2c5.2 0 8.2 5.2 8.2 5.2a14 14 0 0 1-2.1 2.7M5.3 6.3C3 7.8 1.8 10 1.8 10s3 5.2 8.2 5.2c1.6 0 3-.5 4.2-1.2" />
    <path d="M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4" />
    <path d="m2.5 2.5 15 15" />
  </svg>
);

export const MailIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
    <path d="m3 5.5 7 5.2 7-5.2" />
  </svg>
);

export const ImageIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <circle cx="7" cy="8" r="1.5" />
    <path d="m17.5 13-4-4-8 7.5" />
  </svg>
);

export const ExternalLinkIcon = ({ size = 16, className }: IconProps) => (
  <svg {...svgProps(size, className)}>
    <path d="M11 3.5h5.5V9M16.5 3.5 9 11" />
    <path d="M14 11.5v4a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
  </svg>
);
