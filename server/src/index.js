import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { accountsRouter } from './routes/accounts.js';
import { initWebSocket } from './ws/hub.js';
import { startPolling } from './services/poller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use('/api', accountsRouter);

// Two frontends, one server: the kiosk display (frontend/dist, served at
// "/") and the companion settings app (companion/dist, served at
// "/companion"). Both are built separately and just picked up here so the
// Pi only has to run one process. In dev, run each app's own Vite server
// instead — these static blocks simply won't find anything, which is fine.
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
const companionDist = path.join(__dirname, '..', '..', 'companion', 'dist');

app.use('/companion', express.static(companionDist));
app.get('/companion/*', (req, res, next) => {
  res.sendFile(path.join(companionDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/companion')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const server = http.createServer(app);
initWebSocket(server);

server.listen(config.port, () => {
  console.log(`WallCalToDo server listening on http://localhost:${config.port}`);
  startPolling();
});
