import { google } from 'googleapis';
import { config } from '../config.js';
import { readJson, writeJson } from '../store/fileStore.js';
import { getCredentials } from '../services/credentialsService.js';

const ACCOUNTS_FILE = 'googleAccounts.json';
// calendar.readonly to read events, userinfo.email so we can label each
// connected account and dedupe reconnects by email instead of creating
// duplicate entries.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const loadAccounts = () => readJson(ACCOUNTS_FILE, {});
const saveAccounts = (accounts) => writeJson(ACCOUNTS_FILE, accounts);

function slugify(email) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function createClient() {
  const { clientId, clientSecret } = getCredentials('google');
  return new google.auth.OAuth2(clientId, clientSecret, config.google.redirectUri);
}

export function isConfigured() {
  const { clientId, clientSecret } = getCredentials('google');
  return Boolean(clientId && clientSecret);
}

export function getAuthUrl() {
  if (!isConfigured()) {
    throw new Error('Google OAuth is not configured — enter a Client ID/Secret in the companion app’s Google Calendar section.');
  }
  return createClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

// List of { id, email, calendars: [{ id, summary, backgroundColor, enabled }] }.
// Tokens are intentionally omitted — this is what the companion app reads.
export function listAccounts() {
  return Object.values(loadAccounts()).map(({ id, email, calendars }) => ({ id, email, calendars }));
}

export function isAuthorized() {
  return Object.keys(loadAccounts()).length > 0;
}

// Re-fetches this account's calendar list from Google and merges it with
// whatever enabled/disabled state the companion app already set — newly
// discovered calendars default to enabled, removed ones are dropped.
export async function refreshCalendarList(accountId) {
  const accounts = loadAccounts();
  const account = accounts[accountId];
  if (!account) throw new Error(`Unknown Google account: ${accountId}`);

  const client = createClient();
  client.setCredentials(account.tokens);
  const calendarApi = google.calendar({ version: 'v3', auth: client });
  const { data } = await calendarApi.calendarList.list();

  const existingById = new Map((account.calendars || []).map((cal) => [cal.id, cal]));
  account.calendars = (data.items || []).map((item) => ({
    id: item.id,
    summary: item.summaryOverride || item.summary || item.id,
    backgroundColor: item.backgroundColor || null,
    enabled: existingById.get(item.id)?.enabled ?? true,
  }));

  saveAccounts(accounts);
  return account.calendars;
}

// Exchanges an OAuth code for tokens, identifies which Google account they
// belong to, and stores/updates that account's record. Reconnecting an
// already-known email updates its tokens in place rather than duplicating it.
export async function exchangeCode(code) {
  const client = createClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  const accountId = slugify(profile.email);

  const accounts = loadAccounts();
  accounts[accountId] = {
    id: accountId,
    email: profile.email,
    tokens,
    calendars: accounts[accountId]?.calendars || [],
  };
  saveAccounts(accounts);

  await refreshCalendarList(accountId);
  return accountId;
}

export function removeAccount(accountId) {
  const accounts = loadAccounts();
  delete accounts[accountId];
  saveAccounts(accounts);
}

export function setCalendarEnabled(accountId, calendarId, enabled) {
  const accounts = loadAccounts();
  const account = accounts[accountId];
  if (!account) throw new Error(`Unknown Google account: ${accountId}`);

  const calendar = account.calendars.find((cal) => cal.id === calendarId);
  if (!calendar) throw new Error(`Unknown calendar ${calendarId} for account ${accountId}`);

  calendar.enabled = enabled;
  saveAccounts(accounts);
}

// Returns an OAuth2 client hydrated with one account's saved tokens.
// googleapis refreshes the access token automatically using the refresh
// token when it expires; we just persist whatever it hands back so future
// requests (and restarts) keep working.
export function getAuthorizedClient(accountId) {
  const accounts = loadAccounts();
  const account = accounts[accountId];
  if (!account) throw new Error(`Unknown Google account: ${accountId}`);

  const client = createClient();
  client.setCredentials(account.tokens);
  client.on('tokens', (refreshed) => {
    const latest = loadAccounts();
    if (!latest[accountId]) return; // account was removed mid-request
    latest[accountId].tokens = { ...latest[accountId].tokens, ...refreshed };
    saveAccounts(latest);
  });
  return client;
}
