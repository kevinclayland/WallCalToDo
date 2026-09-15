import { Router } from 'express';
import * as googleAuth from '../auth/googleAuth.js';
import * as microsoftAuth from '../auth/microsoftAuth.js';
import { pollCalendar } from '../services/calendarService.js';
import { pollTodo } from '../services/todoService.js';
import { broadcast } from '../ws/hub.js';

export const authRouter = Router();

// These are meant to be visited from a laptop/phone on the same network as
// the Pi to grant access — the "Add Google Account" button in the
// companion app links here directly. A real page navigation, not a fetch
// (the browser has to land on Google's own consent screen), so a failure
// here can't just be a JSON response — send the browser back to the
// companion app with the reason in the query string instead of hanging or
// showing a raw JSON error page.
authRouter.get('/google', (req, res) => {
  try {
    res.redirect(googleAuth.getAuthUrl());
  } catch (err) {
    res.redirect(`/companion?authError=${encodeURIComponent(err.message)}`);
  }
});

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
    // A real page navigation landing back from Google, not a fetch this
    // app made itself -- a raw JSON 500 page here (e.g. from a pasted
    // Client Secret that doesn't match, or an account not added as a test
    // user yet) reads as the whole thing being broken. Same
    // redirect-with-reason treatment as the two GET routes above.
    res.redirect(`/companion?authError=${encodeURIComponent(`Google auth failed: ${err.message}`)}`);
  }
});

authRouter.get('/microsoft', async (req, res) => {
  try {
    res.redirect(await microsoftAuth.getAuthUrl());
  } catch (err) {
    res.redirect(`/companion?authError=${encodeURIComponent(err.message)}`);
  }
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
    // Same reasoning as the Google callback above.
    res.redirect(`/companion?authError=${encodeURIComponent(`Microsoft auth failed: ${err.message}`)}`);
  }
});
