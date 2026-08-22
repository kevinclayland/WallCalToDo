import { Router } from 'express';
import * as googleAuth from '../auth/googleAuth.js';
import * as microsoftAuth from '../auth/microsoftAuth.js';
import { pollCalendar } from '../services/calendarService.js';
import { pollTodo } from '../services/todoService.js';
import { broadcast } from '../ws/hub.js';

export const authRouter = Router();

// These are meant to be visited from a laptop/phone on the same network as
// the Pi to grant access — the "Add Google Account" button in the
// companion app links here directly.
authRouter.get('/google', (req, res) => res.redirect(googleAuth.getAuthUrl()));

authRouter.get('/google/callback', async (req, res) => {
  try {
    await googleAuth.exchangeCode(req.query.code);
    // Pull the new account's events in immediately rather than waiting for
    // the next poll interval, then send the browser back to the companion
    // app so the just-connected account shows up right away.
    const { changed, events } = await pollCalendar();
    if (changed) broadcast({ type: 'calendar', data: events });
    res.redirect('/companion');
  } catch (err) {
    res.status(500).send(`Google auth failed: ${err.message}`);
  }
});

authRouter.get('/microsoft', async (req, res) => {
  res.redirect(await microsoftAuth.getAuthUrl());
});

authRouter.get('/microsoft/callback', async (req, res) => {
  try {
    await microsoftAuth.exchangeCode(req.query.code);
    // Pull tasks in immediately rather than waiting for the next poll
    // interval, then send the browser back to the companion app so the
    // just-connected lists show up right away — same as the Google flow.
    const { changed, tasks } = await pollTodo();
    if (changed) broadcast({ type: 'todo', data: tasks });
    res.redirect('/companion');
  } catch (err) {
    res.status(500).send(`Microsoft auth failed: ${err.message}`);
  }
});
