import { ERROR_CODES, type ErrorCode, type FieldIssue, type Tokens } from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4100/api/v1';

const ACCESS_TOKEN_KEY = 'sellersdash.admin.accessToken';
const REFRESH_TOKEN_KEY = 'sellersdash.admin.refreshToken';

/** A failed request, carrying the stable code and any field-level issues. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: FieldIssue[];
  readonly requestId?: string;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: { details?: FieldIssue[]; requestId?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options?.details ?? [];
    if (options?.requestId) this.requestId = options.requestId;
  }

  /** Maps field issues onto form state. */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const issue of this.details) errors[issue.field] = issue.message;
    return errors;
  }
}

/* ------------------------------ token storage ------------------------------ */

export const tokenStore = {
  read(): { accessToken: string; refreshToken: string } | null {
    try {
      const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!accessToken || !refreshToken) return null;
      return { accessToken, refreshToken };
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
      return null;
    }
  },
  write(tokens: Tokens): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } catch {
      /* a session that cannot be persisted still works until the tab closes */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* nothing to clean up */
    }
  },
};

/** Fired when a session cannot be recovered, so the app can return to sign-in. */
export const SESSION_EXPIRED_EVENT = 'sellersdash:session-expired';

function announceSessionExpired(): void {
  tokenStore.clear();
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/* ------------------------------ request plumbing ------------------------------ */

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Skip the Authorization header and the refresh dance (used by sign-in). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: FieldIssue[] };
  requestId?: string;
}

async function parse<T>(response: Response): Promise<T> {
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || !envelope?.success) {
    const error = envelope?.error;
    throw new ApiError(
      response.status,
      error?.code ?? ERROR_CODES.INTERNAL_ERROR,
      error?.message ?? 'Something went wrong. Please try again.',
      {
        details: error?.details ?? [],
        ...(envelope?.requestId ? { requestId: envelope.requestId } : {}),
      },
    );
  }

  return envelope.data as T;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Refreshes the session once, sharing one attempt across concurrent 401s. */
async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const stored = tokenStore.read();
    if (!stored) return false;

    try {
      const response = await fetch(buildUrl('/admin/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });
      const data = await parse<{ tokens: Tokens }>(response);
      tokenStore.write(data.tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function send<T>(path: string, options: RequestOptions, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (!options.anonymous) {
    const stored = tokenStore.read();
    if (stored) headers.Authorization = `Bearer ${stored.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      ERROR_CODES.NETWORK_ERROR,
      'Cannot reach the server. Check your connection and try again.',
    );
  }

  // An expired access token is recoverable exactly once per request.
  if (response.status === 401 && !options.anonymous && !isRetry) {
    const refreshed = await refreshSession();
    if (refreshed) return send<T>(path, options, true);
    announceSessionExpired();
  }

  return parse<T>(response);
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    send<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    send<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    send<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    send<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    send<T>(path, { ...options, method: 'DELETE' }),
};

export { API_BASE_URL };
