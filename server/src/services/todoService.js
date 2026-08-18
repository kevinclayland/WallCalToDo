import { getAccessToken, isAuthorized } from '../auth/microsoftAuth.js';
import { readJson, writeJson } from '../store/fileStore.js';
import { config } from '../config.js';

const TASKS_CACHE_FILE = 'msTasksCache.json';
const SYNC_FILE = 'msSync.json';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const loadTasks = () => readJson(TASKS_CACHE_FILE, {});
const saveTasks = (cache) => writeJson(TASKS_CACHE_FILE, cache);
const loadSync = () => readJson(SYNC_FILE, {});
const saveSync = (sync) => writeJson(SYNC_FILE, sync);

function normalizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    completed: task.status === 'completed',
    due: task.dueDateTime?.dateTime || null,
    importance: task.importance || 'normal',
  };
}

function sorted(cache) {
  return Object.values(cache).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due || '').localeCompare(b.due || '');
  });
}

async function graphFetch(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const error = new Error(`Graph API error ${res.status}: ${await res.text()}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function resolveListId(accessToken, sync) {
  if (config.ms.todoListId) return config.ms.todoListId;
  if (sync.listId) return sync.listId;

  const data = await graphFetch(`${GRAPH_BASE}/me/todo/lists`, accessToken);
  const lists = data.value || [];
  const defaultList = lists.find((list) => list.wellknownListName === 'defaultList') || lists[0];
  if (!defaultList) throw new Error('No Microsoft To Do lists found for this account.');

  sync.listId = defaultList.id;
  return defaultList.id;
}

export async function pollTodo() {
  if (!(await isAuthorized())) return { changed: false, tasks: [] };

  const accessToken = await getAccessToken();
  const cache = loadTasks();
  const sync = loadSync();
  const listId = await resolveListId(accessToken, sync);
  let changed = false;

  try {
    // Delta queries return only tasks that changed since the last poll
    // (or, on the first run, everything) plus a deltaLink to resume from
    // next time — same idea as Google's sync token.
    let url = sync.deltaLink || `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/delta`;
    let deltaLink;

    do {
      const data = await graphFetch(url, accessToken);
      for (const task of data.value || []) {
        changed = true;
        if (task['@removed']) delete cache[task.id];
        else cache[task.id] = normalizeTask(task);
      }
      url = data['@odata.nextLink'];
      deltaLink = data['@odata.deltaLink'] || deltaLink;
    } while (url);

    sync.deltaLink = deltaLink || sync.deltaLink;
  } catch (err) {
    if (err.status === 410 || err.status === 400) {
      // Delta token expired/invalid — drop it and resync fresh next poll.
      sync.deltaLink = null;
      Object.keys(cache).forEach((id) => delete cache[id]);
    } else {
      throw err;
    }
  }

  saveTasks(cache);
  saveSync(sync);
  return { changed, tasks: sorted(cache) };
}

export function getCachedTasks() {
  return sorted(loadTasks());
}
