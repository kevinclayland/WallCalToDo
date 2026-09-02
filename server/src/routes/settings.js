import { Router } from 'express';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { broadcast } from '../ws/hub.js';

export const settingsRouter = Router();

settingsRouter.get('/settings', (req, res) => {
  res.json(getSettings());
});

settingsRouter.patch('/settings', (req, res) => {
  const { theme, location } = req.body || {};
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

  const settings = updateSettings(patch);
  broadcast({ type: 'settings', data: settings });
  res.json(settings);
});
