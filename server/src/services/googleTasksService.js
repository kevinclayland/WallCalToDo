import { google } from 'googleapis';
import { getAuthorizedClient, hasTasksScope, listAccounts } from '../auth/googleAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';

const TASKS_CACHE_FILE = 'googleTasksCache.json';
const SYNC_FILE = 'googleTasksSync.json';

const loadTasks = () => readJson(TASKS_CACHE_FILE, {});
const saveTasks = (cache) => writeJson(TASKS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

const cacheKey = (accountId, listId) => `${accountId}::${listId}`;

// Unlike Microsoft's dueDateTime, Google Tasks has no time component at
// all -- `due` is always a date at midnight UTC (e.g.
// "2024-01-15T00:00:00.000Z"), even if the user picked a specific day in
// the Tasks UI. There's no per-task time to lose or misinterpret here, but
// callers (the to-do list's due date display) should not render a time
// for Google items the way they do for Microsoft ones -- date only.
function toIsoDue(due) {
  return due || null;
}

function normalizeTask(task, context) {
  return {
    id: task.id,
    title: task.title || '(untitled)',
    completed: task.status === 'completed',
    due: toIsoDue(task.due),
    // Google Tasks never carries a real time -- `due` is always UTC
    // midnight for whatever date was picked. Rendering that as a local
    // instant (see TodoView.jsx) would shift the calendar date back a day
    // in any timezone behind UTC, so the display needs to know this is a
    // date-only value and handle it the way calendarService's `allDay`
    // flag handles all-day events, not the way Microsoft's real due
    // date/time is handled.
    dueHasTime: false,
    importance: 'normal', // Google Tasks has no importance/priority field
    listLabel: context.listLabel,
    // Google Task lists carry no color (unlike calendars), so there's no
    // per-list legend to keep in sync -- but the merged to-do view still
    // wants a stable grouping order rather than whatever order object
    // keys happen to iterate in, same reasoning as calendarOrder below.
    listOrder: context.listOrder,
  };
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due || '').localeCompare(b.due || '');
  });
}

// Mirrors calendarService's pollOneCalendar, adapted for the Tasks API's
// timestamp-based incremental fetch (updatedMin) instead of a sync token
// -- the Tasks API has no syncToken/delta mechanism the way Calendar and
// Microsoft To Do both do. On a list's first-ever poll (no stored
// lastSyncedAt), this does a full fetch; afterward it asks Google for
// only what changed since the last successful poll.
async function pollOneList(tasksApi, key, listId, context, cache, sync) {
  const entries = cache[key] || {};
  cache[key] = entries;
  let changed = false;
  const isFirstPoll = !sync[key]?.lastSyncedAt;

  // Recorded before the request goes out, not after, so anything modified
  // on Google's side while this request is in flight still gets picked up
  // on the *next* poll instead of being silently skipped (a small amount
  // of re-fetched overlap is harmless; a missed update isn't).
  const pollStartedAt = new Date().toISOString();

  try {
    let pageToken;
    do {
      const { data } = await tasksApi.tasks.list({
        tasklist: listId,
        showCompleted: true,
        showHidden: true,
        showDeleted: !isFirstPoll,
        updatedMin: isFirstPoll ? undefined : sync[key].lastSyncedAt,
        maxResults: 100,
        pageToken,
      });
      for (const task of data.items || []) {
        changed = true;
        if (task.deleted) delete entries[task.id];
        else entries[task.id] = normalizeTask(task, context);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    sync[key] = { lastSyncedAt: pollStartedAt };
  } catch (err) {
    if (err.code === 404) {
      // List was deleted on Google's side -- drop it, same idea as
      // calendarService dropping an expired/invalid sync token.
      Object.keys(entries).forEach((id) => delete entries[id]);
      delete sync[key];
      changed = true;
    } else {
      throw err;
    }
  }

  return changed;
}

export async function pollTasks() {
  const accounts = listAccounts();
  if (accounts.length === 0) return { changed: false, tasks: [] };

  const cache = loadTasks();
  const sync = loadSync();
  let changed = false;
  let listOrder = 0;

  for (const account of accounts) {
    const enabledLists = (account.tasklists || []).filter((list) => list.enabled);
    if (enabledLists.length === 0) continue;

    if (!hasTasksScope(account.id)) {
      // Connected before tasks.readonly was added to the requested
      // scopes, or the grant was later revoked -- surface this the same
      // way a failed connection is already surfaced in the companion app
      // banner, rather than hammering the API with requests that will
      // just 403 every cycle.
      console.error(`[googleTasks] ${account.email} needs to reconnect to grant Tasks access`);
      continue;
    }

    let tasksApi;
    try {
      tasksApi = google.tasks({ version: 'v1', auth: getAuthorizedClient(account.id) });
    } catch (err) {
      console.error(`[googleTasks] skipping account ${account.email}:`, err.message);
      continue;
    }

    for (const list of enabledLists) {
      const key = cacheKey(account.id, list.id);
      const context = { listLabel: list.title, listOrder: listOrder++ };
      try {
        const listChanged = await pollOneList(tasksApi, key, list.id, context, cache, sync);
        changed = changed || listChanged;
      } catch (err) {
        if (err.code === 401 || err.code === 403) {
          console.error(`[googleTasks] auth failed for ${account.email} / ${list.title} — needs re-auth`);
        } else {
          console.error(`[googleTasks] poll failed for ${account.email} / ${list.title}:`, err.message);
        }
      }
    }
  }

  saveTasks(cache);
  saveSync(sync);
  return { changed, tasks: getCachedTasks() };
}

// Purges cached tasks/sync state for one list -- called when a list is
// removed from the enabled set and its history shouldn't linger.
export function dropListCache(accountId, listId) {
  const key = cacheKey(accountId, listId);
  const cache = loadTasks();
  const sync = loadSync();
  delete cache[key];
  delete sync[key];
  saveTasks(cache);
  saveSync(sync);
}

// Purges cached tasks/sync state for every list belonging to an account --
// called when a Google account is disconnected. Mirrors calendarService's
// dropAccountCache exactly, since both caches use the same
// "${accountId}::${id}" key scheme.
export function dropAccountCache(accountId) {
  const prefix = `${accountId}::`;
  const cache = loadTasks();
  const sync = loadSync();
  for (const key of Object.keys(cache)) {
    if (key.startsWith(prefix)) delete cache[key];
  }
  for (const key of Object.keys(sync)) {
    if (key.startsWith(prefix)) delete sync[key];
  }
  saveTasks(cache);
  saveSync(sync);
}

// Weekly tidy-up (see poller.js's Monday check), same semantics as
// todoService's clearCompletedTasks: drops completed tasks from the local
// cache only, never touches the real task in Google Tasks. Sync state is
// untouched, so a task that gets re-completed or edited later reappears
// on the next poll like any other change, same as the Microsoft side.
export function clearCompletedTasks() {
  const cache = loadTasks();
  for (const entries of Object.values(cache)) {
    for (const [id, task] of Object.entries(entries)) {
      // Same defensive skip as todoService.clearCompletedTasks -- this
      // cache is a plain JSON file with no atomic write guarantee, so a
      // malformed entry shouldn't be trusted to always be shaped right.
      if (!task) { delete entries[id]; continue; }
      if (task.completed) delete entries[id];
    }
  }
  saveTasks(cache);
  return getCachedTasks();
}

// Only tasks from currently-enabled lists are returned -- toggling a list
// off in the companion app takes effect immediately, without waiting for
// or triggering a new poll. Same read-time filtering as calendarService's
// getCachedEvents / todoService's getCachedTasks.
export function getCachedTasks() {
  const cache = loadTasks();
  const enabledKeys = new Set();
  for (const account of listAccounts()) {
    for (const list of account.tasklists || []) {
      if (list.enabled) enabledKeys.add(cacheKey(account.id, list.id));
    }
  }

  const tasks = [];
  for (const key of Object.keys(cache)) {
    if (!enabledKeys.has(key)) continue;
    // Same defensive skip as todoService.getCachedTasks -- a null entry
    // here would otherwise reach sortTasks() below and crash on
    // `a.completed`.
    tasks.push(...Object.values(cache[key]).filter(Boolean));
  }
  return sortTasks(tasks);
}
