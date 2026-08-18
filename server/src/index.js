import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { initWebSocket } from './ws/hub.js';
import { startPolling } from './services/poller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// The frontend is built separately (frontend/dist) and served here so the
// Pi only has to run one process. During development, run the Vite dev
// server instead (see frontend/README) and this static block just won't
// find anything, which is fine.
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
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
