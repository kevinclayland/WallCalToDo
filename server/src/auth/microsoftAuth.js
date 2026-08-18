import fs from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { config } from '../config.js';
import { dataFilePath } from '../store/fileStore.js';

const CACHE_FILE = dataFilePath('msalCache.json');
// offline_access is required explicitly (MSAL does not add it implicitly)
// to get back a refresh token we can use for silent renewal.
const SCOPES = ['Tasks.Read', 'offline_access'];

const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    if (fs.existsSync(CACHE_FILE)) {
      cacheContext.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      fs.writeFileSync(CACHE_FILE, cacheContext.tokenCache.serialize());
    }
  },
};

// Built lazily rather than at import time: MSAL's constructor throws
// immediately if the client secret is empty, which would otherwise crash
// the whole server on startup before Microsoft credentials are configured
// (e.g. while still setting up Google, or before either is set up).
let msalClient = null;

function getClient() {
  if (!config.ms.clientId || !config.ms.clientSecret) {
    throw new Error('Microsoft OAuth is not configured — set MS_CLIENT_ID/MS_CLIENT_SECRET in server/.env.');
  }
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.ms.clientId,
        authority: `https://login.microsoftonline.com/${config.ms.tenantId}`,
        clientSecret: config.ms.clientSecret,
      },
      cache: { cachePlugin },
    });
  }
  return msalClient;
}

export function getAuthUrl() {
  return getClient().getAuthCodeUrl({ scopes: SCOPES, redirectUri: config.ms.redirectUri });
}

export function exchangeCode(code) {
  return getClient().acquireTokenByCode({ code, scopes: SCOPES, redirectUri: config.ms.redirectUri });
}

export async function isAuthorized() {
  if (!config.ms.clientId || !config.ms.clientSecret) return false;
  const accounts = await getClient().getTokenCache().getAllAccounts();
  return accounts.length > 0;
}

// MSAL persists the refresh token in its cache (via cachePlugin above) and
// silently uses it to mint a new access token here whenever the old one
// has expired — no manual refresh-token bookkeeping needed.
export async function getAccessToken() {
  const client = getClient();
  const accounts = await client.getTokenCache().getAllAccounts();
  if (!accounts.length) {
    throw new Error('Microsoft account not connected. Visit /auth/microsoft to connect.');
  }
  const result = await client.acquireTokenSilent({ account: accounts[0], scopes: SCOPES });
  return result.accessToken;
}
