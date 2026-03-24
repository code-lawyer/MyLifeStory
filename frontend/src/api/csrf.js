const DISABLED = Symbol('csrf-disabled');
let cachedToken = null;
let fetchPromise = null;

export async function getCsrfToken() {
  if (cachedToken === DISABLED) return null;
  if (cachedToken) return cachedToken;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/csrf-token')
    .then((res) => res.json())
    .then((data) => {
      cachedToken = data.token === 'disabled' ? DISABLED : data.token;
      fetchPromise = null;
      return cachedToken === DISABLED ? null : cachedToken;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });

  return fetchPromise;
}

export function clearCsrfCache() {
  cachedToken = null;
  fetchPromise = null;
}
