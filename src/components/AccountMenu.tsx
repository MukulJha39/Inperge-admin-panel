import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from './Avatar';
import { Chip } from './Chip';
import { AccountIcon, ChevronDownIcon, LogoutIcon } from './Icon';

/**
 * The signed-in administrator, and the two things they can do about it.
 *
 * Opens on click rather than hover: a menu that appears when the pointer passes over it is
 * a menu people open by accident, and one of the items here signs them out.
 */
export function AccountMenu() {
  const { admin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Closing on an outside click or on Escape is what people expect of a menu, and Escape
  // returns the focus to the control that opened it rather than dropping it on the page.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!admin) return null;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`account-menu__trigger${open ? ' account-menu__trigger--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar name={admin.name} size="sm" />
        <span className="account-menu__identity">
          <span className="account-menu__name truncate">{admin.name}</span>
          <span className="account-menu__role truncate">{admin.role.name}</span>
        </span>
        <ChevronDownIcon size={14} className="account-menu__caret" />
      </button>

      {open ? (
        <div className="account-menu__panel" id={menuId} role="menu">
          <div className="account-menu__header">
            <Avatar name={admin.name} />
            <div className="grow">
              <div className="text-medium truncate">{admin.name}</div>
              <div className="text-xs text-muted truncate">{admin.email}</div>
            </div>
          </div>

          <div className="account-menu__meta">
            <Chip tone="brand">{admin.role.name}</Chip>
            <Chip tone={admin.status === 'active' ? 'success' : 'danger'} dot>
              {admin.status === 'active' ? 'Active' : 'Suspended'}
            </Chip>
          </div>

          <div className="account-menu__items">
            <Link to="/account" role="menuitem" className="account-menu__item" onClick={() => setOpen(false)}>
              <AccountIcon size={16} />
              My profile
            </Link>

            <button
              type="button"
              role="menuitem"
              className="account-menu__item account-menu__item--danger"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogoutIcon size={16} />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
