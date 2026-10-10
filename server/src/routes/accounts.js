import { Router } from 'express';
import * as googleAuth from '../auth/googleAuth.js';
import * as microsoftAuth from '../auth/microsoftAuth.js';
import { pollCalendar, getCachedEvents, dropAccountCache } from '../services/calendarService.js';
import { getCachedTasks, dropListCache, dropAllListsCache } from '../services/todoService.js';
import { broadcast } from '../ws/hub.js';

export const accountsRouter = Router();

accountsRouter.get('/accounts', (req, res) => {
  res.json({ google: googleAuth.listAccounts() });
});

accountsRouter.get('/todo/lists', async (req, res) => {
  res.json({ lists: microsoftAuth.listTodoLists(), account: await microsoftAuth.getConnectedAccount() });
});

// Only one Microsoft account is ever connected at a time, so this doesn't
// need an :accountId param the way Google's DELETE /accounts/:id does.
accountsRouter.delete('/todo/account', async (req, res) => {
  try {
    await microsoftAuth.disconnectAccount();
    dropAllListsCache();
    broadcast({ type: 'todo', data: getCachedTasks() });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggling a list takes effect immediately — no repoll needed,
// getCachedTasks() filters by the current enabled flags.
accountsRouter.patch('/todo/lists/:listId', (req, res) => {
  try {
    microsoftAuth.setTodoListEnabled(req.params.listId, Boolean(req.body?.enabled));
    broadcast({ type: 'todo', data: getCachedTasks() });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manual "check for new/removed lists on this account" — Microsoft doesn't
// push list changes, so this is a deliberate refresh rather than something
// polled automatically. Also how a newly-shared list (e.g. one shared by a
// spouse) shows up without waiting for a reconnect.
accountsRouter.post('/todo/refresh', async (req, res) => {
  try {
    const before = new Set(microsoftAuth.listTodoLists().map((list) => list.id));
    const lists = await microsoftAuth.refreshTodoLists();
    for (const id of before) {
      if (!lists.some((list) => list.id === id)) dropListCache(id);
    }
    broadcast({ type: 'todo', data: getCachedTasks() });
    res.json({ lists });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

accountsRouter.delete('/accounts/:accountId', (req, res) => {
  if (!googleAuth.listAccounts().some((account) => account.id === req.params.accountId)) {
    return res.status(404).json({ error: `Unknown Google account: ${req.params.accountId}` });
  }
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
