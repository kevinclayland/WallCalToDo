// Small fetch wrapper shared by every component: same-origin request to the
// backend's REST API, JSON in and out, and a normalized Error on any non-2xx
// response so callers can just try/catch instead of checking res.ok themselves.
export async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}
