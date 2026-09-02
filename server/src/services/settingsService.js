import { readJson, writeJson } from '../store/fileStore.js';
import { getSunTimes } from './sunService.js';

const SETTINGS_FILE = 'settings.json';
// 'dark' matches the only look this project has ever shipped with, so a
// fresh install (or one from before this setting existed) doesn't change
// anything until someone actually opens the toggle.
const DEFAULT_SETTINGS = { theme: 'dark', location: null };

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
}

// Settings plus today's sunrise/sunset for the saved location — what every
// consumer (the settings API, the WebSocket push) actually wants. Computed
// fresh on every call rather than cached: it's cheap pure math, and this
// way it's never stale even if the server's been running since yesterday.
export function getSettings() {
  const settings = loadSettings();
  if (!settings.location) return { ...settings, sunrise: null, sunset: null };
  const { sunrise, sunset } = getSunTimes(settings.location.lat, settings.location.lon);
  return { ...settings, sunrise, sunset };
}

export function updateSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  writeJson(SETTINGS_FILE, next);
  return getSettings();
}
