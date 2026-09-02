import { useCallback, useEffect, useState } from 'react';

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}

// The OAuth redirect URI registered with Google/Microsoft is hardcoded to
// http://localhost:3000/... (required — both providers only allow plain
// http:// for the literal loopback address). So the final leg of the
// connect flow only reaches this server when the browser doing it is
// running on the Pi itself, at that exact hostname; from any other device
// (e.g. a phone on the same Wi-Fi, even via this same companion app) it
// looks like it's working right up through Google/Microsoft's own consent
// screen, then silently fails on the redirect back. Gate the buttons on
// that same condition instead of letting it fail confusingly.
const CAN_ADD_ACCOUNTS = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Browser geolocation is only available in a secure context (https:, or the
// localhost/127.0.0.1 exception) — same underlying restriction as the OAuth
// callback above, different mechanism. Off the Pi's own screen (plain http
// over the LAN), the API itself won't be there to call.
const CAN_USE_GEOLOCATION = typeof navigator !== 'undefined' && Boolean(navigator.geolocation) && window.isSecureContext;

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Automatic' },
];

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyAccountId, setBusyAccountId] = useState(null);

  const [todoLists, setTodoLists] = useState([]);
  const [todoLoading, setTodoLoading] = useState(true);
  const [todoBusy, setTodoBusy] = useState(false);

  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const data = await api('/settings');
      setSettings(data);
      if (data.location) {
        setLatInput(String(data.location.lat));
        setLonInput(String(data.location.lon));
      }
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

  async function setTheme(theme) {
    setSettings((prev) => ({ ...prev, theme })); // optimistic — feels instant
    try {
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify({ theme }) });
      setSettings(data);
    } catch (err) {
      setError(err.message);
      loadSettings();
    }
  }

  async function saveLocation(lat, lon) {
    setLocationBusy(true);
    try {
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify({ location: { lat, lon } }) });
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLocationBusy(false);
    }
  }

  function useMyLocation() {
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLatInput(String(latitude));
        setLonInput(String(longitude));
        saveLocation(latitude, longitude);
      },
      (err) => {
        setError(`Couldn't get your location: ${err.message}`);
        setLocationBusy(false);
      }
    );
  }

  function submitManualLocation(e) {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError('Enter valid latitude and longitude numbers.');
      return;
    }
    saveLocation(lat, lon);
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

  return (
    <div className="page">
      <header className="page__header">
        <h1>WallCalToDo</h1>
      </header>

      <section className="settings-card">
        <h2 className="settings-card__heading">General settings</h2>
        <div className="segmented" role="group" aria-label="Theme">
          {THEME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`segmented__option${settings?.theme === value ? ' is-active' : ''}`}
              disabled={settingsLoading}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {settings?.theme === 'auto' && (
          <div className="location-settings">
            <p className="location-settings__hint">
              Automatic switches between light and dark at sunrise and sunset for this location.
            </p>

            {settings.location && settings.sunrise && settings.sunset && (
              <p className="location-settings__times">
                Sunrise {formatTime(settings.sunrise)} · Sunset {formatTime(settings.sunset)}
              </p>
            )}
            {settings.location && (!settings.sunrise || !settings.sunset) && (
              <p className="location-settings__times">
                The sun doesn't rise or set today at this location — staying on dark.
              </p>
            )}

            {CAN_USE_GEOLOCATION && (
              <button type="button" className="button button--ghost" disabled={locationBusy} onClick={useMyLocation}>
                Use my location
              </button>
            )}

            <form className="location-settings__manual" onSubmit={submitManualLocation}>
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={lonInput}
                onChange={(e) => setLonInput(e.target.value)}
              />
              <button type="submit" className="button button--ghost" disabled={locationBusy}>
                Set
              </button>
            </form>
          </div>
        )}
      </section>

      <header className="page__header">
        <h1>Google Calendar</h1>
        <p className="page__subtitle">Manage which Google calendars show up on the display.</p>
      </header>

      {error && <p className="banner banner--error">{error}</p>}
      {loading && <p className="banner">Loading…</p>}

      {!loading && accounts.length === 0 && (
        <p className="banner">No Google accounts connected yet. Add one below to get started.</p>
      )}

      <div className="account-list">
        {accounts.map((account) => (
          <section key={account.id} className="account-card">
            <div className="account-card__header">
              <h2>{account.email}</h2>
              <div className="account-card__actions">
                <button
                  className="button button--ghost"
                  disabled={busyAccountId === account.id}
                  onClick={() => refreshAccount(account.id)}
                >
                  Refresh calendars
                </button>
                <button
                  className="button button--danger"
                  disabled={busyAccountId === account.id}
                  onClick={() => disconnectAccount(account.id, account.email)}
                >
                  Disconnect
                </button>
              </div>
            </div>

            <ul className="calendar-list">
              {account.calendars.map((cal) => (
                <li key={cal.id} className="calendar-row">
                  <span className="calendar-row__swatch" style={{ background: cal.backgroundColor || '#888' }} />
                  <span className="calendar-row__label">{cal.summary}</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={cal.enabled}
                      onChange={(e) => toggleCalendar(account.id, cal.id, e.target.checked)}
                    />
                    <span className="switch__track" />
                  </label>
                </li>
              ))}
              {account.calendars.length === 0 && <li className="calendar-row calendar-row--empty">No calendars found.</li>}
            </ul>
          </section>
        ))}
      </div>

      {CAN_ADD_ACCOUNTS ? (
        <a className="button button--primary add-account" href="/auth/google">
          + Add Google account
        </a>
      ) : (
        <p className="add-account-note">
          You can only add a new Google account on the Pi's own screen — open{' '}
          <code>http://localhost:3000/companion</code> there.
        </p>
      )}

      <header className="page__header page__header--section">
        <h1>Microsoft To Do Reminders</h1>
        <p className="page__subtitle">Choose which lists show up on the display — including ones shared with you.</p>
      </header>

      {!todoLoading && todoLists.length === 0 && (
        <p className="banner">
          No Microsoft account connected yet, or no To Do lists found. Connect one below to get started.
        </p>
      )}

      {todoLists.length > 0 && (
        <section className="account-card">
          <div className="account-card__header">
            <div className="account-card__actions">
              <button className="button button--ghost" disabled={todoBusy} onClick={refreshTodoLists}>
                Refresh lists
              </button>
            </div>
          </div>

          <ul className="calendar-list">
            {todoLists.map((list) => (
              <li key={list.id} className="calendar-row">
                <span className="calendar-row__label">{list.displayName}</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={list.enabled}
                    onChange={(e) => toggleTodoList(list.id, e.target.checked)}
                  />
                  <span className="switch__track" />
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {CAN_ADD_ACCOUNTS ? (
        <a className="button button--primary add-account" href="/auth/microsoft">
          + Connect Microsoft account
        </a>
      ) : (
        <p className="add-account-note">
          You can only connect a new Microsoft account on the Pi's own screen — open{' '}
          <code>http://localhost:3000/companion</code> there.
        </p>
      )}
    </div>
  );
}
