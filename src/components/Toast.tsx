import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './Icon';
import { IconButton } from './Button';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastContextValue {
  notify: (toast: { tone?: ToastTone; title: string; message?: string }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

const TONE_ICON = {
  success: <CheckIcon size={16} />,
  error: <AlertIcon size={16} />,
  info: <InfoIcon size={16} />,
};

/** Lightweight confirmation rather than an interrupting dialog (PRD section 22). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<number>());

  // Pending auto-dismiss timers must not outlive the provider.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ tone = 'info', title, message }: { tone?: ToastTone; title: string; message?: string }) => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [...current, { id, tone, title, ...(message ? { message } : {}) }]);

      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, AUTO_DISMISS_MS);
      timers.current.add(timer);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (title, message) => notify({ tone: 'success', title, ...(message ? { message } : {}) }),
      error: (title, message) => notify({ tone: 'error', title, ...(message ? { message } : {}) }),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <span aria-hidden="true">{TONE_ICON[toast.tone]}</span>
            <div className="grow">
              <div className="toast__title">{toast.title}</div>
              {toast.message ? <div className="toast__message">{toast.message}</div> : null}
            </div>
            <IconButton label="Dismiss" icon={<CloseIcon size={14} />} onClick={() => dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
