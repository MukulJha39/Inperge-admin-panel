import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../utils/useFocusTrap';
import { IconButton } from './Button';
import { CloseIcon } from './Icon';

interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  wide?: boolean;
  /** Blocks closing while a submit is in flight, so a half-saved form cannot vanish. */
  busy?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Off-canvas form panel: blurred backdrop, animated entrance, clear title, close
 * action, sticky action area and trapped focus (PRD section 25).
 *
 * The drawer never clears the form itself — the caller keeps its own state, so values
 * survive a failed validation round trip.
 */
export function Drawer({
  open,
  title,
  description,
  wide = false,
  busy = false,
  onClose,
  footer,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(panelRef, {
    active: open,
    onEscape: () => {
      if (!busy) onClose();
    },
  });

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="drawer-backdrop"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        className={`drawer${wide ? ' drawer--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="drawer__header">
          <div>
            <h2 className="drawer__title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="drawer__description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close panel" icon={<CloseIcon />} onClick={onClose} disabled={busy} />
        </header>

        <div className="drawer__body">{children}</div>

        {footer ? <footer className="drawer__footer">{footer}</footer> : null}
      </div>
    </>,
    document.body,
  );
}
