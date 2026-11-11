import axios from 'axios';
import { getCookie } from './cookies';

/**
 * Keeps the signed-in user's access token fresh.
 *
 * The access cookie lives 30 minutes and the browser simply stops sending it
 * afterwards. Most image/processing routes accept guests, so an expired
 * session would silently turn the user into a guest (gallery empty, uploads
 * rejected) and a 401-retry interceptor would never fire. So before each API
 * call we refresh proactively once the tokens are REFRESH_AFTER_MS old.
 *
 * "Signed in" = the JS-readable pf_csrf cookie exists (it is issued with the
 * refresh token, has the same lifetime and is cleared on logout).
 */
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const LAST_REFRESH_KEY = 'pixelflow_last_token_refresh';
export const REFRESH_AFTER_MS = Number(process.env.REACT_APP_TOKEN_REFRESH_MINUTES || 20) * 60 * 1000;
/** Fired on window when the refresh token is rejected, i.e. the user is signed out. */
export const AUTH_EXPIRED_EVENT = 'pixelflow:auth-expired';

let inflight: Promise<boolean> | null = null;

function lastRefresh(): number {
  try {
    return Number(localStorage.getItem(LAST_REFRESH_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Call after anything that issues fresh tokens (login, register, Google, refresh). */
export function markTokensFresh(): void {
  try {
    localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function hasSignedInSession(): boolean {
  return !!getCookie('pf_csrf');
}

/** Single-flight refresh. Resolves true if the tokens are fresh afterwards. */
export function refreshTokens(): Promise<boolean> {
  if (!inflight) {
    const startedAt = Date.now();
    inflight = axios
      .post(`${API_BASE_URL}/auth/refresh`, {}, {
        withCredentials: true,
        headers: { 'X-CSRF-Token': getCookie('pf_csrf') || '' },
        // marker so our own request interceptors don't recurse
        _skipTokenFreshness: true,
      } as any)
      .then(() => {
        markTokensFresh();
        return true;
      })
      .catch((err) => {
        // Another tab may have rotated the refresh token a moment ago; the
        // shared cookie jar already holds the new one.
        if (lastRefresh() >= startedAt - 30000) return true;
        if (err?.response?.status === 401) {
          // Refresh token expired or revoked: the user is signed out.
          document.cookie = 'pf_csrf=; Max-Age=0; path=/';
          window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
        }
        return false;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Refresh first if signed in and the tokens are getting old. */
export async function ensureFreshTokens(): Promise<void> {
  if (!hasSignedInSession()) return;
  if (Date.now() - lastRefresh() < REFRESH_AFTER_MS) return;
  await refreshTokens();
}

const NO_FRESHNESS_URLS = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout', '/auth/google'];

export function needsFreshness(config: any): boolean {
  if (config?._skipTokenFreshness) return false;
  const url: string = config?.url || '';
  return !NO_FRESHNESS_URLS.some((u) => url.includes(u));
}

const UNSAFE_METHODS = ['post', 'put', 'delete', 'patch'];

/**
 * Request interceptor shared by the global axios and the `api` instance:
 * refresh if needed, THEN attach the CSRF header (a refresh rotates pf_csrf).
 */
export async function prepareRequest(config: any) {
  if (needsFreshness(config)) await ensureFreshTokens();
  if (config.method && UNSAFE_METHODS.includes(String(config.method).toLowerCase())) {
    const csrf = getCookie('pf_csrf');
    if (csrf) {
      config.headers = config.headers ?? {};
      config.headers['X-CSRF-Token'] = csrf;
    }
  }
  return config;
}

/**
 * Response interceptor factory: on 401, refresh once and retry the request
 * with the same client (fallback for when the proactive refresh was skipped,
 * e.g. the computer slept past the refresh window).
 */
export function retryOn401(client: (config: any) => Promise<any>) {
  return async (error: any) => {
    const original = error?.config;
    if (
      error?.response?.status === 401 &&
      original &&
      !original._retried &&
      needsFreshness(original) &&
      hasSignedInSession()
    ) {
      original._retried = true;
      if (await refreshTokens()) return client(original);
    }
    return Promise.reject(error);
  };
}
