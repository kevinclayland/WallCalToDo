import { readJson, writeJson } from '../store/fileStore.js';
import { config } from '../config.js';

const CREDENTIALS_FILE = 'apiCredentials.json';

const load = () => readJson(CREDENTIALS_FILE, {});
const save = (data) => writeJson(CREDENTIALS_FILE, data);

// server/.env's GOOGLE_CLIENT_ID/SECRET and MS_CLIENT_ID/SECRET are the
// original way to configure these (still fine for anyone who prefers
// editing a file over the UI) — whatever's saved through the companion
// app's own credentials form just takes priority over them, so an .env
// value only ever acts as a fallback default.
function envDefaults(provider) {
  return provider === 'google'
    ? { clientId: config.google.clientId || '', clientSecret: config.google.clientSecret || '' }
    : {
        clientId: config.ms.clientId || '',
        clientSecret: config.ms.clientSecret || '',
        tenantId: config.ms.tenantId || 'common',
      };
}

// { clientId, clientSecret, tenantId } actually used to build the OAuth client —
// read by googleAuth.js/microsoftAuth.js, never by the companion app
// directly (see getCredentialsStatus below for what that gets).
export function getCredentials(provider) {
  const stored = load()[provider];
  const fallback = envDefaults(provider);
  if (stored?.clientId && stored?.clientSecret) {
    // tenantId isn't required the way clientId/clientSecret are — an empty
    // saved value should still fall back to the env default ('common'),
    // not to an empty string.
    return provider === 'ms'
      ? { ...stored, tenantId: stored.tenantId || fallback.tenantId }
      : stored;
  }
  return fallback;
}

export function setCredentials(provider, { clientId, clientSecret, tenantId }) {
  const data = load();
  data[provider] = provider === 'ms'
    ? { clientId, clientSecret, tenantId: tenantId || 'common' }
    : { clientId, clientSecret };
  save(data);
}

// What the companion app's credentials form reads/shows: the client ID
// and tenant ID (neither sensitive, safe to echo back so the fields
// aren't blank after a reload) and whether a secret is actually on file
// -- the secret itself is write-only, never sent back out once saved.
export function getCredentialsStatus() {
  const status = (provider) => {
    const stored = load()[provider];
    const fallback = envDefaults(provider);
    const clientId = stored?.clientId || fallback.clientId;
    const configured = Boolean((stored?.clientId && stored?.clientSecret) || (fallback.clientId && fallback.clientSecret));
    const base = { clientId, configured };
    return provider === 'ms'
      ? { ...base, tenantId: stored?.tenantId || fallback.tenantId }
      : base;
  };
  return { google: status('google'), ms: status('ms') };
}