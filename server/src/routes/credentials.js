import { Router } from 'express';
import { getCredentialsStatus, setCredentials } from '../services/credentialsService.js';
import { resetClient as resetMsalClient } from '../auth/microsoftAuth.js';

export const credentialsRouter = Router();

// { google: { clientId, configured }, ms: { clientId, configured } } —
// never the client secret itself, just enough for the companion app's
// credentials form to show what's already saved (and pre-fill the client
// ID) instead of always looking blank/unset.
credentialsRouter.get('/credentials', (req, res) => {
  res.json(getCredentialsStatus());
});

credentialsRouter.put('/credentials/:provider', (req, res) => {
  const { provider } = req.params;
  if (!['google', 'ms'].includes(provider)) return res.status(400).json({ error: 'Unknown provider' });

  const clientId = (req.body?.clientId || '').trim();
  const clientSecret = (req.body?.clientSecret || '').trim();
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'Client ID and Client Secret are both required' });

  setCredentials(provider, { clientId, clientSecret });
  // The MSAL client is built once and cached — without this, saving new
  // Microsoft credentials wouldn't take effect until the server restarted.
  if (provider === 'ms') resetMsalClient();

  res.json(getCredentialsStatus());
});
