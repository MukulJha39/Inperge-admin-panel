import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon } from './Icon';

interface Breadcrumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  badge?: ReactNode;
  actions?: ReactNode;
}

/** Header → tabs → filters → data → actions, consistently (PRD section 25). */
export function PageHeader({ title, description, breadcrumbs, badge, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="grow">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="row gap-2">
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                {index < breadcrumbs.length - 1 ? <ChevronRightIcon size={12} /> : null}
              </span>
            ))}
          </nav>
        ) : null}

        <div className="page-header__title">
          <h1>{title}</h1>
          {badge}
        </div>

        {description ? <p className="page-header__description">{description}</p> : null}
      </div>

      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}
