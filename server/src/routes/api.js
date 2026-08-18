import { Router } from 'express';
import { getCachedEvents } from '../services/calendarService.js';
import { getCachedTasks } from '../services/todoService.js';
import { isAuthorized as isGoogleAuthorized } from '../auth/googleAuth.js';
import { isAuthorized as isMsAuthorized } from '../auth/microsoftAuth.js';

export const apiRouter = Router();

apiRouter.get('/calendar', (req, res) => res.json(getCachedEvents()));
apiRouter.get('/todo', (req, res) => res.json(getCachedTasks()));

apiRouter.get('/status', async (req, res) => {
  res.json({
    googleConnected: isGoogleAuthorized(),
    microsoftConnected: await isMsAuthorized(),
  });
});
