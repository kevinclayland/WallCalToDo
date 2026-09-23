import { google } from 'googleapis';
import { config } from '../config.js';
import { readJson, writeJson } from '../store/fileStore.js';
import { getCredentials } from '../services/credentialsService.js';

const ACCOUNTS_FILE = 'googleAccounts.json';
// calendar.readonly to read events, tasks.readonly to read task lists,
// userinfo.email so we can label each connected account and dedupe
// reconnects by email instead of creating duplicate entries.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
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

// List of { id, email, calendars: [...], tasklists: [...], tasksScopeGranted }.
// Tokens are intentionally omitted — this is what the companion app reads.
// tasksScopeGranted lets the UI tell someone their account was connected
// before Tasks support existed (or the grant was revoked) and needs a
// reconnect, rather than that only showing up as a poll failure in the
// server's own logs (see hasTasksScope's fuller reasoning below).
export function listAccounts() {
  return Object.values(loadAccounts()).map(({ id, email, calendars, tasklists, tokens }) => ({
    id,
    email,
    calendars,
    tasklists: tasklists || [],
    tasksScopeGranted: Boolean(tokens?.scope?.includes('tasks.readonly')),
  }));
}

export function isAuthorized() {
  return Object.keys(loadAccounts()).length > 0;
}

// Accounts connected before the tasks.readonly scope was added won't have
// it on their existing token. Google doesn't reject with a clean "missing
// scope" error up front — a Tasks API call with an insufficiently-scoped
// token comes back as a 403/insufficient permission error, same as any
// other authorization failure, which is what callers should watch for and
// turn into a "reconnect this account" prompt rather than a silent poll
// failure every cycle.
export function hasTasksScope(accountId) {
  const account = loadAccounts()[accountId];
  return Boolean(account?.tokens?.scope?.includes('tasks.readonly'));
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

// Mirrors refreshCalendarList, for task lists. Google Task lists carry no
// color field (unlike calendars) — just id and title.
export async function refreshTaskList(accountId) {
  const accounts = loadAccounts();
  const account = accounts[accountId];
  if (!account) throw new Error(`Unknown Google account: ${accountId}`);

  const client = createClient();
  client.setCredentials(account.tokens);
  const tasksApi = google.tasks({ version: 'v1', auth: client });
  const { data } = await tasksApi.tasklists.list();

  const existingById = new Map((account.tasklists || []).map((list) => [list.id, list]));
  account.tasklists = (data.items || []).map((item) => ({
    id: item.id,
    title: item.title || item.id,
    enabled: existingById.get(item.id)?.enabled ?? true,
  }));

  saveAccounts(accounts);
  return account.tasklists;
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
    tasklists: accounts[accountId]?.tasklists || [],
  };
  saveAccounts(accounts);

  await refreshCalendarList(accountId);
  // A reconnect on an account that already granted tasks.readonly is a
  // harmless no-op refresh; on a first-time connect it populates the
  // tasklists array for the first time. Don't let a Tasks-side failure
  // block the (already-working) Calendar connect flow.
  try {
    await refreshTaskList(accountId);
  } catch (err) {
    console.error(`[googleAuth] failed to fetch task lists for ${profile.email}:`, err.message);
  }

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

export function setTaskListEnabled(accountId, taskListId, enabled) {
  const accounts = loadAccounts();
  const account = accounts[accountId];
  if (!account) throw new Error(`Unknown Google account: ${accountId}`);

  const list = (account.tasklists || []).find((l) => l.id === taskListId);
  if (!list) throw new Error(`Unknown task list ${taskListId} for account ${accountId}`);

  list.enabled = enabled;
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
