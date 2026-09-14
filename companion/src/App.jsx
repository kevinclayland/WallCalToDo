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

  useEffect(() => {
    loadAccounts();
    loadTodoLists();
    loadSettings();
  }, [loadAccounts, loadTodoLists, loadSettings]);

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

      <GeneralSettings
        settings={settings}
        settingsLoading={settingsLoading}
        onSetPrivacyMode={setPrivacyMode}
        onSetTheme={setTheme}
        onSetAdvancedEnabled={setAdvancedEnabled}
        onSetOffset={setOffset}
        onSaveLocation={saveLocation}
        onError={setError}
      />

      <GoogleAccounts
        accounts={accounts}
        loading={loading}
        error={error}
        busyAccountId={busyAccountId}
        onToggleCalendar={toggleCalendar}
        onRefreshAccount={refreshAccount}
        onDisconnectAccount={disconnectAccount}
      />

      <MicrosoftTodo
        todoLists={todoLists}
        todoLoading={todoLoading}
        todoBusy={todoBusy}
        msAccount={msAccount}
        onToggleTodoList={toggleTodoList}
        onRefreshTodoLists={refreshTodoLists}
        onDisconnectMsAccount={disconnectMsAccount}
      />
    </div>
  );
}
