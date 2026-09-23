import fs from 'fs';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { config } from '../config.js';
import { dataFilePath, readJson, writeJson } from '../store/fileStore.js';
import { getCredentials } from '../services/credentialsService.js';

const CACHE_FILE = dataFilePath('msalCache.json');
const LISTS_FILE = 'msLists.json';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
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
  const { clientId, clientSecret, tenantId } = getCredentials('ms');
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth is not configured — enter a Client ID/Secret in the companion app’s Microsoft To Do section.');
  }
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientSecret,
      },
      cache: { cachePlugin },
    });
  }
  return msalClient;
}

// The MSAL client above is built once and cached (its constructor needs a
// real clientId/clientSecret up front) -- call this after saving new
// credentials through the companion app so the next request rebuilds it
// with them, instead of keeping whatever it was (or wasn't) built with at
// server startup.
export function resetClient() {
  msalClient = null;
}

export function isConfigured() {
  const { clientId, clientSecret } = getCredentials('ms');
  return Boolean(clientId && clientSecret);
}

export function getAuthUrl() {
  return getClient().getAuthCodeUrl({ scopes: SCOPES, redirectUri: config.ms.redirectUri });
}

export async function exchangeCode(code) {
  const result = await getClient().acquireTokenByCode({ code, scopes: SCOPES, redirectUri: config.ms.redirectUri });
  // Populate the list of To Do lists immediately so the companion app has
  // something to show right after connecting, without a separate step.
  await refreshTodoLists();
  return result;
}

export async function isAuthorized() {
  if (!isConfigured()) return false;
  const accounts = await getClient().getTokenCache().getAllAccounts();
  return accounts.length > 0;
}

// { email } for the companion app to display, or null if nothing's
// connected yet — mirrors how each Google account shows its email.
export async function getConnectedAccount() {
  if (!isConfigured()) return null;
  const accounts = await getClient().getTokenCache().getAllAccounts();
  return accounts[0] ? { email: accounts[0].username } : null;
}

// Removes the account from MSAL's persisted token cache and clears the
// list of To Do lists — the actual cached tasks/sync state is cleared
// separately by todoService.dropAllListsCache(), same split as Google's
// removeAccount()/dropAccountCache() pair.
export async function disconnectAccount() {
  if (!isConfigured()) return;
  const client = getClient();
  const accounts = await client.getTokenCache().getAllAccounts();
  for (const account of accounts) {
    await client.getTokenCache().removeAccount(account);
  }
  writeJson(LISTS_FILE, []);
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

// Thin wrapper shared with todoService.js so both places hit the Graph
// API the same way instead of each keeping their own copy.
export async function graphFetch(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const error = new Error(`Graph API error ${res.status}: ${await res.text()}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

// [{ id, displayName, enabled }] — what the companion app reads and what
// todoService.js polls. Mirrors googleAuth's listAccounts()/calendars
// shape: multiple lists can be enabled at once (e.g. your personal list
// plus one shared with your wife), not just a single hardcoded default.
export function listTodoLists() {
  return readJson(LISTS_FILE, []);
}

// Re-fetches the account's To Do lists from Graph and merges them with
// whatever enabled/disabled state the companion app already set — newly
// discovered lists default to enabled, removed ones are dropped.
export async function refreshTodoLists() {
  const accessToken = await getAccessToken();
  const data = await graphFetch(`${GRAPH_BASE}/me/todo/lists`, accessToken);

  const existing = new Map(listTodoLists().map((list) => [list.id, list]));
  const lists = (data.value || []).map((item) => ({
    id: item.id,
    displayName: item.displayName || item.id,
    enabled: existing.get(item.id)?.enabled ?? true,
  }));
  writeJson(LISTS_FILE, lists);
  return lists;
}

export function setTodoListEnabled(listId, enabled) {
  const lists = listTodoLists();
  const list = lists.find((l) => l.id === listId);
  if (!list) throw new Error(`Unknown To Do list: ${listId}`);
  list.enabled = enabled;
  writeJson(LISTS_FILE, lists);
}
