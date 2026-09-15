import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import GeneralSettings from './components/GeneralSettings.jsx';
import GoogleAccounts from './components/GoogleAccounts.jsx';
import MicrosoftTodo from './components/MicrosoftTodo.jsx';

// Same logic as frontend/src/App.jsx's effectiveTheme() — kept as its own
// copy here since the two apps are separate Vite builds with nothing
// shared between them. 'light'/'dark' settings are direct; 'auto'
// switches at sunrise/sunset for the saved location; falls back to 'light'
// (the companion app's own original, only-ever-shipped look) if settings
// haven't loaded yet or auto mode has no location/sun-times to go on.
function effectiveTheme(settings, now) {
  if (!settings) return 'light';
  if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
  if (!settings.sunrise || !settings.sunset) return 'light';
  const sunrise = new Date(settings.sunrise);
  const sunset = new Date(settings.sunset);
  return now >= sunrise && now < sunset ? 'light' : 'dark';
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyAccountId, setBusyAccountId] = useState(null);

  const [todoLists, setTodoLists] = useState([]);
  const [todoLoading, setTodoLoading] = useState(true);
  const [todoBusy, setTodoBusy] = useState(false);
  const [msAccount, setMsAccount] = useState(null);

  const [credentials, setCredentials] = useState(null);
  // Separate from `error` below on purpose: `error` reflects live API call
  // failures and gets cleared to null the moment any of them next
  // succeeds (see loadSettings/loadAccounts/loadTodoLists), which raced
  // with and immediately wiped this out when it shared that same state --
  // this is a one-off notice about an OAuth attempt that already finished,
  // so it needs its own lifecycle, cleared only when the user dismisses it.
  const [authError, setAuthError] = useState(null);

  const [settings, setSettings] = useState(null);
  // Its own clock, same pattern as the kiosk display's App.jsx: only needs
  // to catch the sunrise/sunset boundary passing while this page happens to
  // be left open, not tick every second.
  const [now, setNow] = useState(() => new Date());
  const [settingsLoading, setSettingsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api('/settings');
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await api('/accounts');
      setAccounts(data.google);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTodoLists = useCallback(async () => {
    try {
      const data = await api('/todo/lists');
      setTodoLists(data.lists);
      setMsAccount(data.account);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setTodoLoading(false);
    }
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      setCredentials(await api('/credentials'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadTodoLists();
    loadSettings();
    loadCredentials();
  }, [loadAccounts, loadTodoLists, loadSettings, loadCredentials]);

  // The OAuth connect flow is a real page navigation through Google/
  // Microsoft's own consent screen (see routes/auth.js), not a fetch this
  // app makes itself -- if it fails before even getting there (credentials
  // not configured, request rejected), the server sends the browser back
  // here with the reason in the query string instead of a raw JSON error
  // page. Surface it once, then clean the URL so a refresh doesn't re-show
  // a stale error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get('authError');
    if (message) {
      setAuthError(message);
      params.delete('authError');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Matches the companion app's own look to whatever theme is actually
  // active on the wall display -- switching Light/Dark/Automatic here
  // updates `settings` immediately (see patchSetting below), which this
  // picks straight up.
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme(settings, now);
  }, [settings, now]);

  // Single implementation shared by every plain settings field below
  // (theme, sunrise/sunset offsets, advanced toggle, privacy mode):
  // optimistic local update so the control feels instant, then a PATCH
  // reconciled against whatever the server actually saved, or rolled back
  // via a fresh loadSettings() if the request fails.
  async function patchSetting(patch) {
    setSettings((prev) => ({ ...prev, ...patch }));
    try {
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify(patch) });
      setSettings(data);
    } catch (err) {
      setError(err.message);
      loadSettings();
    }
  }

  const setTheme = (theme) => patchSetting({ theme });
  // key is 'sunriseOffset' or 'sunsetOffset'.
  const setOffset = (key, offset) => patchSetting({ [key]: offset });
  // A real on/off for whether sunriseOffset/sunsetOffset apply at all, not
  // just a local show/hide -- off means the theme switches exactly at the
  // real sunrise/sunset regardless of what's saved, on reapplies the saved
  // values without needing to re-enter them.
  const setAdvancedEnabled = (enabled) => patchSetting({ advancedEnabled: enabled });
  // On the wall display: strips event titles down to just their colored
  // pills, and swaps the today-agenda and to-do list contents for a
  // placeholder notice -- their headings stay so the display still reads
  // as "there's a calendar/to-do here", just not what's on it.
  const setPrivacyMode = (enabled) => patchSetting({ privacyMode: enabled });
  // 'F' or 'C' -- which unit the outside-temperature display uses.
  const setTempUnit = (tempUnit) => patchSetting({ tempUnit });

  // Unlike the settings above, a location save isn't optimistic (there's no
  // sensible "local" value to show before the server geocodes/validates
  // it) and never throws -- LocationSettings owns the busy-state around
  // this call itself.
  async function saveLocation(lat, lon, label) {
    try {
      const location = label ? { lat, lon, label } : { lat, lon };
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify({ location }) });
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // provider is 'google' or 'ms'. Throws on failure so ApiCredentialsForm
  // can show the error inline next to the fields instead of it going to
  // the shared banner above the account list.
  async function saveCredentials(provider, { clientId, clientSecret }) {
    const data = await api(`/credentials/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ clientId, clientSecret }),
    });
    setCredentials(data);
  }

  async function toggleCalendar(accountId, calendarId, enabled) {
    // Optimistic update so the switch feels instant; reconciled by the
    // next loadAccounts() if the request fails.
    setAccounts((prev) =>
      prev.map((account) =>
        account.id !== accountId
          ? account
          : {
              ...account,
              calendars: account.calendars.map((cal) => (cal.id === calendarId ? { ...cal, enabled } : cal)),
            }
      )
    );
    try {
      await api(`/accounts/${accountId}/calendars/${encodeURIComponent(calendarId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
    } catch (err) {
      setError(err.message);
      loadAccounts();
    }
  }

  async function refreshAccount(accountId) {
    setBusyAccountId(accountId);
    try {
      await api(`/accounts/${accountId}/refresh`, { method: 'POST' });
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAccountId(null);
    }
  }

  async function disconnectAccount(accountId, email) {
    if (!window.confirm(`Disconnect ${email}? Its events will disappear from the display.`)) return;
    setBusyAccountId(accountId);
    try {
      await api(`/accounts/${accountId}`, { method: 'DELETE' });
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAccountId(null);
    }
  }

  async function toggleTodoList(listId, enabled) {
    // Optimistic update so the switch feels instant; reconciled by the
    // next loadTodoLists() if the request fails.
    setTodoLists((prev) => prev.map((list) => (list.id === listId ? { ...list, enabled } : list)));
    try {
      await api(`/todo/lists/${encodeURIComponent(listId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
    } catch (err) {
      setError(err.message);
      loadTodoLists();
    }
  }

  // Microsoft doesn't push list changes, so this is how a newly-shared
  // list (e.g. one your spouse just shared with you) shows up without
  // waiting for a reconnect.
  async function refreshTodoLists() {
    setTodoBusy(true);
    try {
      await api('/todo/refresh', { method: 'POST' });
      await loadTodoLists();
    } catch (err) {
      setError(err.message);
    } finally {
      setTodoBusy(false);
    }
  }

  async function disconnectMsAccount(email) {
    if (!window.confirm(`Disconnect ${email}? Its to-do items will disappear from the display.`)) return;
    setTodoBusy(true);
    try {
      await api('/todo/account', { method: 'DELETE' });
      await loadTodoLists();
    } catch (err) {
      setError(err.message);
    } finally {
      setTodoBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header page__header--main">
        <h1>WallCalToDo</h1>
      </header>

      <header className="page__header page__header--sub">
        <h1>General settings</h1>
      </header>

      {/* Top-level, not tucked inside whichever section triggered it --
          errors here can come from Google, Microsoft, or settings, so a
          single spot at the top is the only one guaranteed to be visible
          regardless of which one it was. */}
      {error && <p className="banner banner--error">{error}</p>}

      {/* A failed OAuth redirect (see the authError effect above) --
          dismissible, since unlike `error` above nothing else clears it
          automatically. */}
      {authError && (
        <p className="banner banner--error">
          {authError}{' '}
          <button type="button" className="link-button banner__dismiss" onClick={() => setAuthError(null)}>
            Dismiss
          </button>
        </p>
      )}

      <GeneralSettings
        settings={settings}
        settingsLoading={settingsLoading}
        onSetPrivacyMode={setPrivacyMode}
        onSetTheme={setTheme}
        onSetAdvancedEnabled={setAdvancedEnabled}
        onSetOffset={setOffset}
        onSetTempUnit={setTempUnit}
        onSaveLocation={saveLocation}
        onError={setError}
      />

      <GoogleAccounts
        accounts={accounts}
        loading={loading}
        busyAccountId={busyAccountId}
        credentialsStatus={credentials?.google}
        onSaveCredentials={(creds) => saveCredentials('google', creds)}
        onToggleCalendar={toggleCalendar}
        onRefreshAccount={refreshAccount}
        onDisconnectAccount={disconnectAccount}
      />

      <MicrosoftTodo
        todoLists={todoLists}
        todoLoading={todoLoading}
        todoBusy={todoBusy}
        msAccount={msAccount}
        credentialsStatus={credentials?.ms}
        onSaveCredentials={(creds) => saveCredentials('ms', creds)}
        onToggleTodoList={toggleTodoList}
        onRefreshTodoLists={refreshTodoLists}
        onDisconnectMsAccount={disconnectMsAccount}
      />
    </div>
  );
}
