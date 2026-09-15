import { pollCalendar, resetSyncTokens as resetCalendarSyncTokens } from './calendarService.js';
import { pollTodo } from './todoService.js';
import { getSettings } from './settingsService.js';
import { pollWeather } from './weatherService.js';
import { broadcast } from '../ws/hub.js';
import { config } from '../config.js';

// Weather doesn't need calendar/todo's minute-by-minute freshness, so it's
// gated to its own much longer interval inside the same poll loop instead
// of a separate timer.
const WEATHER_POLL_INTERVAL_MS = 15 * 60 * 1000;

let timer = null;
let lastFullResyncDay = null;
let lastSettingsDay = null;
let lastWeatherPollAt = 0;

async function runPoll() {
  const today = new Date().toDateString();
  if (lastFullResyncDay !== today) {
    resetCalendarSyncTokens();
    lastFullResyncDay = today;
  }

  const settings = getSettings();

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
    broadcast({ type: 'settings', data: settings });
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

  // Nowhere to fetch weather *for* without a saved location -- skipped
  // entirely rather than erroring every cycle until one's set.
  if (settings.location && Date.now() - lastWeatherPollAt >= WEATHER_POLL_INTERVAL_MS) {
    await pollWeatherNow(settings.location.lat, settings.location.lon);
  }
}

// Fetches, caches, and broadcasts a fresh weather reading right now,
// bypassing WEATHER_POLL_INTERVAL_MS -- exported so the settings route can
// call this the moment a location is saved, rather than making someone who
// just set one up wait up to 15 minutes for the first reading to appear.
export async function pollWeatherNow(lat, lon) {
  try {
    const weather = await pollWeather(lat, lon);
    broadcast({ type: 'weather', data: weather });
    lastWeatherPollAt = Date.now();
  } catch (err) {
    console.error('[poller] Weather poll failed:', err.message);
  }
}

export function startPolling() {
  runPoll(); // populate immediately on boot instead of waiting a full interval
  timer = setInterval(runPoll, config.pollIntervalMs);
}

export function stopPolling() {
  if (timer) clearInterval(timer);
}
