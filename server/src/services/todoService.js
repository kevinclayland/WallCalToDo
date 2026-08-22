import { getAccessToken, graphFetch, isAuthorized, listTodoLists } from '../auth/microsoftAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';

const TASKS_CACHE_FILE = 'msTasksCache.json';
const SYNC_FILE = 'msSync.json';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const loadTasks = () => readJson(TASKS_CACHE_FILE, {});
const saveTasks = (cache) => writeJson(TASKS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

function normalizeTask(task, context) {
  return {
    id: task.id,
    title: task.title,
    completed: task.status === 'completed',
    due: task.dueDateTime?.dateTime || null,
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
