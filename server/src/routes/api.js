import { Router } from 'express';
import { getCachedEvents } from '../services/calendarService.js';
import { getCachedTasks } from '../services/todoService.js';
import { isAuthorized as isGoogleAuthorized } from '../auth/googleAuth.js';
import { isAuthorized as isMsAuthorized } from '../auth/microsoftAuth.js';
import { getCurrentView, setView, toggleView } from '../state/viewState.js';
import { broadcast } from '../ws/hub.js';

export const apiRouter = Router();

apiRouter.get('/calendar', (req, res) => res.json(getCachedEvents()));
apiRouter.get('/todo', (req, res) => res.json(getCachedTasks()));

apiRouter.get('/status', async (req, res) => {
  res.json({
    googleConnected: isGoogleAuthorized(),
    microsoftConnected: await isMsAuthorized(),
    view: getCurrentView(),
  });
});

apiRouter.get('/view', (req, res) => res.json({ view: getCurrentView() }));

// Explicit set — handy for a future admin UI or the dev "v" key shortcut.
apiRouter.post('/view', (req, res) => {
  try {
    const view = setView(req.body?.view);
    broadcast({ type: 'view', data: view });
    res.json({ view });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// This is what the physical button calls: flip the view and push it to
// every connected display over the WebSocket.
apiRouter.post('/view/toggle', (req, res) => {
  const view = toggleView();
  broadcast({ type: 'view', data: view });
  res.json({ view });
});
