import { google } from 'googleapis';
import { getAuthorizedClient, listAccounts } from '../auth/googleAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';

const EVENTS_CACHE_FILE = 'googleEventsCache.json';
const SYNC_FILE = 'googleSync.json';
const FULL_SYNC_WINDOW_DAYS = 90;
// How far back a full sync looks, so it also re-verifies (and can prune)
// events on days the month grid still displays as part of the current
// month — up to a full month back comfortably covers that regardless of
// where in the month "today" currently falls.
const FULL_SYNC_LOOKBACK_DAYS = 35;

const loadEvents = () => readJson(EVENTS_CACHE_FILE, {});
const saveEvents = (cache) => writeJson(EVENTS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

const cacheKey = (accountId, calendarId) => `${accountId}::${calendarId}`;

// Google Calendar's palette (colorId -> hex) is a small, effectively static
// set shared across a whole account, not per-calendar — cheap to fetch once
// per account per poll cycle and cache in memory rather than persisting it.
const eventColorCache = new Map(); // accountId -> { [colorId]: { background } }

async function getEventColors(calendarApi, accountId) {
  if (eventColorCache.has(accountId)) return eventColorCache.get(accountId);
  const { data } = await calendarApi.colors.get();
  const colors = data.event || {};
  eventColorCache.set(accountId, colors);
  return colors;
}

// True for events that should actually show up: ones the user created, or
// invites they've explicitly accepted. Declining an invite you didn't
// organize (Google Calendar's "remove from this calendar" on someone
// else's event) doesn't delete the event — it just flips your own RSVP to
// "declined", so the event keeps coming back from events.list() looking
// unchanged unless this is checked. Same idea for invites still sitting at
// "needsAction"/"tentative": not a yes, so not shown.
function isAcceptedByUser(event) {
  if (event.organizer?.self) return true;
  if (!event.attendees || event.attendees.length === 0) return true; // no invitees at all — a personal event
  const self = event.attendees.find((attendee) => attendee.self);
  return self ? self.responseStatus === 'accepted' : true;
}

// Shared by fullSync/incrementalSync: cancelled and non-accepted events are
// both treated as "shouldn't be cached", everything else gets normalized in.
function upsertEvent(entries, event, context) {
  if (event.status === 'cancelled' || !isAcceptedByUser(event)) delete entries[event.id];
  else entries[event.id] = normalizeEvent(event, context);
}

function normalizeEvent(event, context) {
  // An event can override its calendar's color (Google Calendar's "change
  // color of this event" option) via colorId — respect that when set,
  // otherwise fall back to the calendar's own color.
  const overrideColor = event.colorId && context.eventColors?.[event.colorId]?.background;
  return {
    id: event.id,
    title: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
    location: event.location || null,
    calendarLabel: context.calendarLabel,
    color: overrideColor || context.color,
  };
}

// Full listing, seeded from FULL_SYNC_LOOKBACK_DAYS in the past out to
// FULL_SYNC_WINDOW_DAYS ahead. The final page's nextSyncToken becomes our
// handle for cheap incremental polls.
async function fullSync(calendarApi, calendarId, entries, context) {
  const timeMin = new Date(Date.now() - FULL_SYNC_LOOKBACK_DAYS * 86400000).toISOString();
  const timeMax = new Date(Date.now() + FULL_SYNC_WINDOW_DAYS * 86400000).toISOString();
  let pageToken;
  let nextSyncToken = null;
  const seenIds = new Set();

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
      seenIds.add(event.id);
      upsertEvent(entries, event, context);
    }
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);

  // Unlike an incremental sync, a plain listing like this one doesn't ask
  // for (or return) cancelled events — it just silently omits them instead
  // of flagging them, so a genuine deletion can't be detected the same
  // way. Anything already cached inside this window that didn't come back
  // in this fresh listing is gone (deleted, or no longer accessible) and
  // needs pruning explicitly.
  const minTime = new Date(timeMin).getTime();
  const maxTime = new Date(timeMax).getTime();
  for (const [id, cached] of Object.entries(entries)) {
    const startTime = new Date(cached.start).getTime();
    if (startTime >= minTime && startTime <= maxTime && !seenIds.has(id)) delete entries[id];
  }

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
      upsertEvent(entries, event, context);
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

    // Non-fatal: per-event color overrides are a nice-to-have, not worth
    // skipping this account's whole poll over if the palette fetch fails.
    const eventColors = await getEventColors(calendarApi, account.id).catch((err) => {
      console.error(`[calendar] failed to fetch event color palette for ${account.email}:`, err.message);
      return {};
    });

    for (const cal of account.calendars) {
      const key = cacheKey(account.id, cal.id);
      const context = { calendarLabel: cal.summary, color: cal.backgroundColor, eventColors };
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
