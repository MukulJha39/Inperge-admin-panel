import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/States';
import { AlertIcon } from '../components/Icon';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Page not found" />
      <section className="card">
        <EmptyState
          title="This page does not exist"
          message="The link may be out of date. Head back to the merchants list to continue."
          action={{ label: 'Go to merchants', onClick: () => navigate('/merchants') }}
        />
      </section>
    </>
  );
}

/** Shown when a role lacks the permission a route requires. */
export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Not available to your role" />
      <section className="card">
        <EmptyState
          icon={<AlertIcon size={20} />}
          title="You do not have permission for this section"
          message="Your role does not include access to this area. Ask a super administrator if you need it."
          action={{ label: 'Go to my account', onClick: () => navigate('/account') }}
        />
      </section>
    </>
  );
}
