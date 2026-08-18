import { google } from 'googleapis';
import { getAuthorizedClient, isAuthorized } from '../auth/googleAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';

const EVENTS_CACHE_FILE = 'googleEventsCache.json';
const SYNC_FILE = 'googleSync.json';
const FULL_SYNC_WINDOW_DAYS = 90;

const loadEvents = () => readJson(EVENTS_CACHE_FILE, {});
const saveEvents = (cache) => writeJson(EVENTS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

function normalizeEvent(event) {
  return {
    id: event.id,
    title: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    location: event.location || null,
  };
}

function sorted(cache) {
  return Object.values(cache).sort((a, b) => new Date(a.start) - new Date(b.start));
}

// Full listing, seeded from "now" out to FULL_SYNC_WINDOW_DAYS. The final
// page's nextSyncToken becomes our handle for cheap incremental polls.
async function fullSync(calendar, cache) {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + FULL_SYNC_WINDOW_DAYS * 86400000).toISOString();
  let pageToken;
  let nextSyncToken = null;

  do {
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    for (const event of data.items || []) {
      if (event.status === 'cancelled') delete cache[event.id];
      else cache[event.id] = normalizeEvent(event);
    }
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);

  return nextSyncToken;
}

// Incremental listing using the stored sync token — only events that
// changed since the last poll come back, which is what makes frequent
// polling cheap.
async function incrementalSync(calendar, cache, syncToken) {
  let pageToken;
  let nextSyncToken = null;
  let changed = false;

  do {
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      syncToken,
      showDeleted: true,
      pageToken,
    });
    for (const event of data.items || []) {
      changed = true;
      if (event.status === 'cancelled') delete cache[event.id];
      else cache[event.id] = normalizeEvent(event);
    }
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);

  return { changed, nextSyncToken };
}

export async function pollCalendar() {
  if (!isAuthorized()) return { changed: false, events: [] };

  const calendar = google.calendar({ version: 'v3', auth: getAuthorizedClient() });
  const cache = loadEvents();
  const sync = loadSync();
  let changed = false;

  try {
    if (!sync.syncToken) {
      sync.syncToken = await fullSync(calendar, cache);
      changed = true;
    } else {
      const result = await incrementalSync(calendar, cache, sync.syncToken);
      changed = result.changed;
      sync.syncToken = result.nextSyncToken || sync.syncToken;
    }
  } catch (err) {
    if (err.code === 410) {
      // Sync token expired or invalid (e.g. server-side history pruned) —
      // drop it and fall back to a full resync.
      Object.keys(cache).forEach((id) => delete cache[id]);
      sync.syncToken = await fullSync(calendar, cache);
      changed = true;
    } else {
      throw err;
    }
  }

  saveEvents(cache);
  saveSync(sync);
  return { changed, events: sorted(cache) };
}

// Forces the next pollCalendar() call to do a full resync. The poller uses
// this once a day so the sync window (which Google pins to the original
// full-sync request's time range) rolls forward and stale past events get
// pruned, instead of the window slowly going stale.
export function resetSyncToken() {
  const sync = loadSync();
  sync.syncToken = null;
  saveSync(sync);
}

export function getCachedEvents() {
  return sorted(loadEvents());
}
