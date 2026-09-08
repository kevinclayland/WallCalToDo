import { pollCalendar, resetSyncTokens as resetCalendarSyncTokens } from './calendarService.js';
import { pollTodo } from './todoService.js';
import { getSettings } from './settingsService.js';
import { broadcast } from '../ws/hub.js';
import { config } from '../config.js';

let timer = null;
let lastFullResyncDay = null;
let lastSettingsDay = null;

async function runPoll() {
  const today = new Date().toDateString();
  if (lastFullResyncDay !== today) {
    resetCalendarSyncTokens();
    lastFullResyncDay = today;
  }

  // getSettings() computes sunrise/sunset for "today" at call time, but a
  // connected display only gets a `settings` message when it (re)connects
  // (see ws/hub.js) — this kiosk can stay connected for days, so without
  // this it keeps yesterday's sunrise/sunset forever. Those are absolute
  // timestamps for a specific calendar day, so once "now" rolls past
  // midnight it's already past that stale sunset too, which permanently
  // fails the auto-theme's `now < sunset` check and locks it on dark —
  // sunset-triggered dark still worked because that comparison only needs
  // to hold true once, on the same day the values were fetched. Rebroadcast
  // once a day so every connected display picks up the new day's times.
  if (lastSettingsDay !== today) {
    broadcast({ type: 'settings', data: getSettings() });
    lastSettingsDay = today;
  }

  try {
    const { changed, events } = await pollCalendar();
    if (changed) broadcast({ type: 'calendar', data: events });
  } catch (err) {
    console.error('[poller] Calendar poll failed:', err.message);
  }

  try {
    const { changed, tasks } = await pollTodo();
    if (changed) broadcast({ type: 'todo', data: tasks });
  } catch (err) {
    console.error('[poller] Todo poll failed:', err.message);
  }
}

export function startPolling() {
  runPoll(); // populate immediately on boot instead of waiting a full interval
  timer = setInterval(runPoll, config.pollIntervalMs);
}

export function stopPolling() {
  if (timer) clearInterval(timer);
}
