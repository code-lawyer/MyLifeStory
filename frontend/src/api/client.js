import { getCsrfToken, clearCsrfCache } from './csrf.js';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const hasBody = options.body != null;
  const headers = { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...options.headers };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await getCsrfToken();
    if (token) headers['x-csrf-token'] = token;
  }

  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) clearCsrfCache();
    throw new ApiError(res.status, body);
  }
  return body;
}
