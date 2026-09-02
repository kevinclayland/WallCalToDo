import { readJson, writeJson } from '../store/fileStore.js';
import { getSunTimes } from './sunService.js';

const SETTINGS_FILE = 'settings.json';
// 'dark' matches the only look this project has ever shipped with, so a
// fresh install (or one from before this setting existed) doesn't change
// anything until someone actually opens the toggle. Offsets default to 0
// (switch exactly at the real sunrise/sunset) until someone opens Advanced
// and picks something else.
const DEFAULT_SETTINGS = {
  theme: 'dark',
  location: null,
  sunriseOffset: { minutes: 0, direction: 'after' },
  sunsetOffset: { minutes: 0, direction: 'after' },
};

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
}

// Shifts a sun-event time by the configured offset -- 'before' subtracts,
// 'after' adds. This is what actually ties the companion app's Sunrise/
// Sunset offset controls into the theme switch: getSettings() below returns
// this adjusted time as `sunrise`/`sunset`, and that's the only thing
// App.jsx's auto-theme check ever looks at, so it never needs to know
// offsets exist at all.
function applyOffset(date, offset) {
  if (!date) return date;
  const ms = offset.minutes * 60 * 1000;
  return new Date(date.getTime() + (offset.direction === 'before' ? -ms : ms));
}

// Settings plus today's sunrise/sunset (already offset-adjusted) for the
// saved location — what every consumer (the settings API, the WebSocket
// push) actually wants. Computed fresh on every call rather than cached:
// it's cheap pure math, and this way it's never stale even if the server's
// been running since yesterday.
export function getSettings() {
  const settings = loadSettings();
  if (!settings.location) return { ...settings, sunrise: null, sunset: null };
  const { sunrise, sunset } = getSunTimes(settings.location.lat, settings.location.lon);
  return {
    ...settings,
    sunrise: applyOffset(sunrise, settings.sunriseOffset),
    sunset: applyOffset(sunset, settings.sunsetOffset),
  };
}

export function updateSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  writeJson(SETTINGS_FILE, next);
  return getSettings();
}
