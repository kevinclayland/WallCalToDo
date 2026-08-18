import { Router } from 'express';
import * as googleAuth from '../auth/googleAuth.js';
import { pollCalendar, getCachedEvents, dropAccountCache } from '../services/calendarService.js';
import { broadcast } from '../ws/hub.js';

export const accountsRouter = Router();

accountsRouter.get('/accounts', (req, res) => {
  res.json({ google: googleAuth.listAccounts() });
});

accountsRouter.delete('/accounts/:accountId', (req, res) => {
  googleAuth.removeAccount(req.params.accountId);
  dropAccountCache(req.params.accountId);
  broadcast({ type: 'calendar', data: getCachedEvents() });
  res.json({ ok: true });
});

// Toggling a calendar takes effect on the display immediately — no repoll
// needed, getCachedEvents() filters by the current enabled flags.
accountsRouter.patch('/accounts/:accountId/calendars/:calendarId', (req, res) => {
  try {
    googleAuth.setCalendarEnabled(req.params.accountId, req.params.calendarId, Boolean(req.body?.enabled));
    broadcast({ type: 'calendar', data: getCachedEvents() });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manual "check for new calendars on this account" — Google doesn't push
// calendar-list changes, so this is a deliberate refresh rather than
// something polled automatically.
accountsRouter.post('/accounts/:accountId/refresh', async (req, res) => {
  try {
    const calendars = await googleAuth.refreshCalendarList(req.params.accountId);
    const { changed, events } = await pollCalendar();
    if (changed) broadcast({ type: 'calendar', data: events });
    res.json({ calendars });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
