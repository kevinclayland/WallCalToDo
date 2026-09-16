import { getAccessToken, graphFetch, isAuthorized, listTodoLists } from '../auth/microsoftAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';

const TASKS_CACHE_FILE = 'msTasksCache.json';
const SYNC_FILE = 'msSync.json';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const loadTasks = () => readJson(TASKS_CACHE_FILE, {});
const saveTasks = (cache) => writeJson(TASKS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

// Graph's dueDateTime.dateTime is a naive "wall clock" string with no
// offset -- only meaningful together with its sibling timeZone field. This
// app never sends a timezone preference header on its Graph requests, so
// Graph's documented default for the To Do tasks API applies: UTC.
// Appending "Z" makes that explicit, so new Date(due) downstream (the
// to-do list's due date/time display) parses it as the correct instant
// instead of silently reinterpreting the same digits as the server/
// browser's own local time -- which is exactly what produced a constant,
// wrong hour on every task with a time set (shifted by whatever the local
// UTC offset happens to be), regardless of the task's real due time.
function toIsoDue(dueDateTime) {
  if (!dueDateTime?.dateTime) return null;
  if (dueDateTime.timeZone === 'UTC') return `${dueDateTime.dateTime}Z`;
  // Unexpected: Graph returned something other than UTC despite no
  // preference header. Pass it through as before rather than guess wrong.
  return dueDateTime.dateTime;
}

function normalizeTask(task, context) {
  return {
    id: task.id,
    title: task.title,
    completed: task.status === 'completed',
    due: toIsoDue(task.dueDateTime),
    importance: task.importance || 'normal',
    listLabel: context.listLabel,
  };
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due || '').localeCompare(b.due || '');
  });
}

// Mirrors calendarService's pollOneCalendar: full delta query the first
// time (no stored deltaLink yet), then a cheap incremental one keyed off
// the delta link Graph handed back last time.
async function pollOneList(accessToken, listId, entries, context, sync, key) {
  let changed = false;
  try {
    let url = sync[key]?.deltaLink || `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/delta`;
    let deltaLink;
    do {
      const data = await graphFetch(url, accessToken);
      for (const task of data.value || []) {
        changed = true;
        if (task['@removed']) delete entries[task.id];
        else entries[task.id] = normalizeTask(task, context);
      }
      url = data['@odata.nextLink'];
      deltaLink = data['@odata.deltaLink'] || deltaLink;
    } while (url);
    sync[key] = { deltaLink: deltaLink || sync[key]?.deltaLink };
  } catch (err) {
    if (err.status === 410 || err.status === 400) {
      // Delta link expired or invalid — drop it and fall back to a full resync.
      Object.keys(entries).forEach((id) => delete entries[id]);
      sync[key] = {};
      changed = true;
    } else {
      throw err;
    }
  }
  return changed;
}

export async function pollTodo() {
  if (!(await isAuthorized())) return { changed: false, tasks: [] };
  const lists = listTodoLists();
  if (lists.length === 0) return { changed: false, tasks: [] };

  const accessToken = await getAccessToken();
  const cache = loadTasks();
  const sync = loadSync();
  let changed = false;

  for (const list of lists) {
    const key = list.id;
    const entries = cache[key] || {};
    cache[key] = entries;
    const context = { listLabel: list.displayName };
    try {
      const listChanged = await pollOneList(accessToken, list.id, entries, context, sync, key);
      changed = changed || listChanged;
    } catch (err) {
      console.error(`[todo] poll failed for list ${list.displayName}:`, err.message);
    }
  }

  saveTasks(cache);
  saveSync(sync);
  return { changed, tasks: getCachedTasks() };
}

// Purges cached tasks/sync state for a list that's no longer returned by
// Microsoft — mirrors dropAccountCache() in calendarService.
export function dropListCache(listId) {
  const cache = loadTasks();
  const sync = loadSync();
  delete cache[listId];
  delete sync[listId];
  saveTasks(cache);
  saveSync(sync);
}

// Wipes every list's cached tasks/sync state — used when disconnecting the
// Microsoft account entirely, since there's only ever the one account.
export function dropAllListsCache() {
  saveTasks({});
  saveSync({});
}

// Weekly tidy-up (see poller.js's Monday check) -- drops completed tasks
// from the local cache only, never touches the real task in Microsoft To
// Do. Safe to do this way: the sync token keeps advancing from where it
// left off, so a task removed here reappears on its own the moment it's
// touched again in Microsoft (completed toggled back off, edited, etc.)
// shows up as a change on the next delta poll, same as any other edit.
export function clearCompletedTasks() {
  const cache = loadTasks();
  for (const entries of Object.values(cache)) {
    for (const [id, task] of Object.entries(entries)) {
      if (task.completed) delete entries[id];
    }
  }
  saveTasks(cache);
  return getCachedTasks();
}

// Only tasks from currently-enabled lists are returned — toggling a list
// off in the companion app takes effect immediately, without waiting for
// or triggering a new poll.
export function getCachedTasks() {
  const cache = loadTasks();
  const enabledIds = new Set(listTodoLists().filter((list) => list.enabled).map((list) => list.id));
  const tasks = [];
  for (const [key, entries] of Object.entries(cache)) {
    if (!enabledIds.has(key)) continue;
    tasks.push(...Object.values(entries));
  }
  return sortTasks(tasks);
}
