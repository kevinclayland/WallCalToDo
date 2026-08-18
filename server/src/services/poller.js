import { pollCalendar, resetSyncTokens as resetCalendarSyncTokens } from './calendarService.js';
import { pollTodo } from './todoService.js';
import { broadcast } from '../ws/hub.js';
import { config } from '../config.js';

let timer = null;
let lastFullResyncDay = null;

async function runPoll() {
  const today = new Date().toDateString();
  if (lastFullResyncDay !== today) {
    resetCalendarSyncTokens();
    lastFullResyncDay = today;
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
