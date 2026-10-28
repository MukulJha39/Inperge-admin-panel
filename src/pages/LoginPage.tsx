import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { ERROR_CODES } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from '../components/Icon';
import { FullPageLoader, InlineAlert } from '../components/States';
import { prefersReducedMotion } from '../utils/useMotion';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (status === 'loading') return <FullPageLoader label="Checking your session" />;

  if (status === 'authenticated') {
    const state = location.state as LocationState | null;
    return <Navigate to={state?.from ?? '/merchants'} replace />;
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Enter your password.';

    setFieldErrors(errors);
    const valid = Object.keys(errors).length === 0;
    if (!valid) shake();
    return valid;
  }

  /** A short horizontal shake so a rejected attempt is felt, not just read. */
  function shake() {
    const form = formRef.current;
    if (!form || typeof form.animate !== 'function' || prefersReducedMotion()) return;
    form.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate() || submitting) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      if (error instanceof ApiError) {
        // Field issues map onto inputs; everything else becomes one clear message.
        const issues = error.fieldErrors();
        if (Object.keys(issues).length > 0) setFieldErrors(issues);

        setFormError(
          error.code === ERROR_CODES.RATE_LIMITED
            ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
            : error.message,
        );
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      shake();
      // The typed password is cleared; the email is kept so a retry is quick.
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to the admin panel. Internal access only — your actions are recorded in the audit history."
      footer={
        process.env.NODE_ENV !== 'production' ? (
          <p className="auth__hint">
            Development seed accounts: <strong>admin@</strong>, <strong>operations@</strong>,{' '}
            <strong>support@</strong>, <strong>finance@</strong>, <strong>readonly@sellersdash.local</strong> — all
            using the password from <code>SEED_SUPER_ADMIN_PASSWORD</code>.
          </p>
        ) : null
      }
    >
      <form ref={formRef} className="stack gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="auth__alert">
            <InlineAlert tone="error">{formError}</InlineAlert>
          </div>
        ) : null}

        <TextField
          label="Email address"
          type="email"
          name="email"
          autoComplete="username"
          placeholder="you@inperge.com"
          autoFocus
          leading={<MailIcon size={16} />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
        />

        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          leading={<LockIcon size={16} />}
          trailing={
            <button
              type="button"
              className="auth__reveal-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((current) => !current)}
            >
              <span className={`auth__eye${showPassword ? '' : ' auth__eye--on'}`}>
                <EyeIcon size={16} />
              </span>
              <span className={`auth__eye${showPassword ? ' auth__eye--on' : ''}`}>
                <EyeOffIcon size={16} />
              </span>
            </button>
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
        />

        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
