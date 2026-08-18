import { google } from 'googleapis';
import { getAuthorizedClient, listAccounts } from '../auth/googleAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';

const EVENTS_CACHE_FILE = 'googleEventsCache.json';
const SYNC_FILE = 'googleSync.json';
const FULL_SYNC_WINDOW_DAYS = 90;

const loadEvents = () => readJson(EVENTS_CACHE_FILE, {});
const saveEvents = (cache) => writeJson(EVENTS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

const cacheKey = (accountId, calendarId) => `${accountId}::${calendarId}`;

function normalizeEvent(event, context) {
  return {
    id: event.id,
    title: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    location: event.location || null,
    calendarLabel: context.calendarLabel,
    color: context.color,
  };
}

// Full listing, seeded from "now" out to FULL_SYNC_WINDOW_DAYS. The final
// page's nextSyncToken becomes our handle for cheap incremental polls.
async function fullSync(calendarApi, calendarId, entries, context) {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + FULL_SYNC_WINDOW_DAYS * 86400000).toISOString();
  let pageToken;
  let nextSyncToken = null;

  do {
    const { data } = await calendarApi.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    for (const event of data.items || []) {
      if (event.status === 'cancelled') delete entries[event.id];
      else entries[event.id] = normalizeEvent(event, context);
    }
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);

  return nextSyncToken;
}

// Incremental listing using the stored sync token — only events that
// changed since the last poll come back, which is what makes frequent
// polling cheap.
async function incrementalSync(calendarApi, calendarId, entries, context, syncToken) {
  let pageToken;
  let nextSyncToken = null;
  let changed = false;

  do {
    const { data } = await calendarApi.events.list({
      calendarId,
      syncToken,
      showDeleted: true,
      pageToken,
    });
    for (const event of data.items || []) {
      changed = true;
      if (event.status === 'cancelled') delete entries[event.id];
      else entries[event.id] = normalizeEvent(event, context);
    }
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);

  return { changed, nextSyncToken };
}

async function pollOneCalendar(calendarApi, key, calendarId, context, cache, sync) {
  const entries = cache[key] || {};
  cache[key] = entries;
  let changed = false;

  try {
    if (!sync[key]?.syncToken) {
      sync[key] = { syncToken: await fullSync(calendarApi, calendarId, entries, context) };
      changed = true;
    } else {
      const result = await incrementalSync(calendarApi, calendarId, entries, context, sync[key].syncToken);
      changed = result.changed;
      sync[key] = { syncToken: result.nextSyncToken || sync[key].syncToken };
    }
  } catch (err) {
    if (err.code === 410) {
      // Sync token expired or invalid — drop it and fall back to a full resync.
      Object.keys(entries).forEach((id) => delete entries[id]);
      sync[key] = { syncToken: await fullSync(calendarApi, calendarId, entries, context) };
      changed = true;
    } else {
      throw err;
    }
  }

  return changed;
}

export async function pollCalendar() {
  const accounts = listAccounts();
  if (accounts.length === 0) return { changed: false, events: [] };

  const cache = loadEvents();
  const sync = loadSync();
  let changed = false;

  for (const account of accounts) {
    let calendarApi;
    try {
      calendarApi = google.calendar({ version: 'v3', auth: getAuthorizedClient(account.id) });
    } catch (err) {
      console.error(`[calendar] skipping account ${account.email}:`, err.message);
      continue;
    }

    for (const cal of account.calendars) {
      const key = cacheKey(account.id, cal.id);
      const context = { calendarLabel: cal.summary, color: cal.backgroundColor };
      try {
        const calChanged = await pollOneCalendar(calendarApi, key, cal.id, context, cache, sync);
        changed = changed || calChanged;
      } catch (err) {
        console.error(`[calendar] poll failed for ${account.email} / ${cal.summary}:`, err.message);
      }
    }
  }

  saveEvents(cache);
  saveSync(sync);
  return { changed, events: getCachedEvents() };
}

// Forces the next pollCalendar() call to do a full resync of every
// account/calendar. The poller uses this once a day so each sync window
// (which Google pins to the original full-sync request's time range)
// rolls forward and stale past events get pruned.
export function resetSyncTokens() {
  saveSync({});
}

// Purges cached events/sync state for calendars that no longer exist for
// an account — called when an account is disconnected.
export function dropAccountCache(accountId) {
  const prefix = `${accountId}::`;
  const cache = loadEvents();
  const sync = loadSync();
  for (const key of Object.keys(cache)) {
    if (key.startsWith(prefix)) delete cache[key];
  }
  for (const key of Object.keys(sync)) {
    if (key.startsWith(prefix)) delete sync[key];
  }
  saveEvents(cache);
  saveSync(sync);
}

// Only events from currently-enabled calendars are returned — toggling a
// calendar off in the companion app takes effect immediately, without
// waiting for or triggering a new poll.
export function getCachedEvents() {
  const cache = loadEvents();
  const enabledKeys = new Set();
  for (const account of listAccounts()) {
    for (const cal of account.calendars) {
      if (cal.enabled) enabledKeys.add(cacheKey(account.id, cal.id));
    }
  }

  const events = [];
  for (const key of Object.keys(cache)) {
    if (!enabledKeys.has(key)) continue;
    events.push(...Object.values(cache[key]));
  }
  return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}
