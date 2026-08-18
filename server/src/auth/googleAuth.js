import { google } from 'googleapis';
import { config } from '../config.js';
import { readJson, writeJson } from '../store/fileStore.js';

const TOKEN_FILE = 'googleTokens.json';
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function createClient() {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export function getAuthUrl() {
  return createClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = createClient();
  const { tokens } = await client.getToken(code);
  writeJson(TOKEN_FILE, tokens);
  return tokens;
}

export function isAuthorized() {
  return Boolean(readJson(TOKEN_FILE, null)?.refresh_token);
}

// Returns an OAuth2 client hydrated with the saved tokens. googleapis
// refreshes the access token automatically using the refresh token when it
// expires; we just need to persist whatever it hands back so future
// requests (and restarts) keep working.
export function getAuthorizedClient() {
  const tokens = readJson(TOKEN_FILE, null);
  if (!tokens?.refresh_token) {
    throw new Error('Google account not connected. Visit /auth/google to connect.');
  }

  const client = createClient();
  client.setCredentials(tokens);
  client.on('tokens', (refreshed) => {
    writeJson(TOKEN_FILE, { ...tokens, ...refreshed });
  });
  return client;
}
