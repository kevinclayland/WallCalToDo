import { Router } from 'express';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { searchPlaces, reverseGeocode } from '../services/geocodeService.js';
import { broadcast } from '../ws/hub.js';

export const settingsRouter = Router();

const OFFSET_MINUTES = [0, 15, 30, 45, 60, 120, 180];

function isValidOffset(offset) {
  return (
    offset &&
    OFFSET_MINUTES.includes(offset.minutes) &&
    ['before', 'after'].includes(offset.direction)
  );
}

settingsRouter.get('/settings', (req, res) => {
  res.json(getSettings());
});

// City-name search for the companion app's location picker — works from
// any device on the LAN (unlike browser geolocation, which needs a secure
// context), which is what makes it the primary way to set a location.
settingsRouter.get('/geocode', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  try {
    res.json({ results: await searchPlaces(q) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Friendly label for a lat/lon, used after "Use my location" so it shows
// something nicer than raw coordinates too.
settingsRouter.get('/geocode/reverse', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: 'Invalid lat/lon' });
  try {
    res.json({ label: await reverseGeocode(lat, lon) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

settingsRouter.patch('/settings', (req, res) => {
  const { theme, location, advancedEnabled, sunriseOffset, sunsetOffset } = req.body || {};
  const patch = {};

  if (theme !== undefined) {
    if (!['light', 'dark', 'auto'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    patch.theme = theme;
  }
  if (location !== undefined) {
    if (location !== null && (typeof location.lat !== 'number' || typeof location.lon !== 'number')) {
      return res.status(400).json({ error: 'Invalid location' });
    }
    patch.location = location;
  }
  if (advancedEnabled !== undefined) {
    if (typeof advancedEnabled !== 'boolean') return res.status(400).json({ error: 'Invalid advancedEnabled' });
    patch.advancedEnabled = advancedEnabled;
  }
  if (sunriseOffset !== undefined) {
    if (!isValidOffset(sunriseOffset)) return res.status(400).json({ error: 'Invalid sunriseOffset' });
    patch.sunriseOffset = sunriseOffset;
  }
  if (sunsetOffset !== undefined) {
    if (!isValidOffset(sunsetOffset)) return res.status(400).json({ error: 'Invalid sunsetOffset' });
    patch.sunsetOffset = sunsetOffset;
  }

  const settings = updateSettings(patch);
  broadcast({ type: 'settings', data: settings });
  res.json(settings);
});
