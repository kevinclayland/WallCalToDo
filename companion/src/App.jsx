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

const OFFSET_MINUTES_OPTIONS = [
  { value: 0, label: 'No delay' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
];

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// One row of the Sunrise/Sunset offset editor: a title showing the
// already-offset-adjusted time (the actual moment the theme will switch,
// not the raw astronomical one), a minutes-amount dropdown, and a
// Before/After segmented control next to it. `offset` is always present
// (the server defaults it), so this never needs to handle it being unset.
function SunOffsetRow({ title, time, offset, disabled, onChange }) {
  // Before/After is meaningless at "No delay" (0 minutes either direction
  // is the same moment), so disable it rather than leave a control that
  // does nothing sitting there active.
  const directionDisabled = disabled || offset.minutes === 0;
  return (
    <div className="sun-offset">
      <p className="sun-offset__title">
        {title} {time ? formatTime(time) : '—'}
      </p>
      <div className="sun-offset__controls">
        <select
          className="sun-offset__select"
          value={offset.minutes}
          disabled={disabled}
          onChange={(e) => onChange({ ...offset, minutes: Number(e.target.value) })}
        >
          {OFFSET_MINUTES_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="segmented segmented--compact" role="group" aria-label={`${title} timing`}>
          {['before', 'after'].map((direction) => (
            <button
              key={direction}
              type="button"
              className={`segmented__option${offset.direction === direction ? ' is-active' : ''}`}
              disabled={directionDisabled}
              onClick={() => onChange({ ...offset, direction })}
            >
              {direction === 'before' ? 'Before' : 'After'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeError, setPlaceError] = useState(null);
  // Purely a local show/hide for the Sunrise/Sunset offset controls, not a
  // saved setting itself -- doesn't need to persist across visits.
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // key is 'sunriseOffset' or 'sunsetOffset'.
  async function setOffset(key, offset) {
    setSettings((prev) => ({ ...prev, [key]: offset })); // optimistic
    try {
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify({ [key]: offset }) });
      setSettings(data);
    } catch (err) {
      setError(err.message);
      loadSettings();
    }
  }

  async function saveLocation(lat, lon, label) {
    setLocationBusy(true);
    try {
      const location = label ? { lat, lon, label } : { lat, lon };
      const data = await api('/settings', { method: 'PATCH', body: JSON.stringify({ location }) });
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLocationBusy(false);
    }
  }

  // Zero-typing option when it's available — but only works in a secure
  // context (see CAN_USE_GEOLOCATION), so city search below is the one that
  // works from anywhere, including a phone setting this up over plain LAN
  // http.
  function useMyLocation() {
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let label;
        try {
          label = (await api(`/geocode/reverse?lat=${latitude}&lon=${longitude}`)).label;
        } catch {
          // Non-fatal — still save the coordinates, just without a
          // friendly name to show for them.
        }
        saveLocation(latitude, longitude, label);
      },
      (err) => {
        setError(`Couldn't get your location: ${err.message}`);
        setLocationBusy(false);
      }
    );
  }

  async function searchPlace(e) {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceSearching(true);
    setPlaceError(null);
    try {
      const { results } = await api(`/geocode?q=${encodeURIComponent(q)}`);
      setPlaceResults(results);
      if (results.length === 0) setPlaceError("No matches — try a different search.");
    } catch (err) {
      setPlaceError(err.message);
    } finally {
      setPlaceSearching(false);
    }
  }

  function choosePlace(place) {
    setPlaceResults([]);
    setPlaceQuery('');
    saveLocation(place.lat, place.lon, place.label);
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

      <section className="settings-card">
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

            {settings.location && (
              <p className="location-settings__current">
                Currently set to{' '}
                <strong>{settings.location.label || `${settings.location.lat.toFixed(2)}, ${settings.location.lon.toFixed(2)}`}</strong>
              </p>
            )}

            <form className="location-settings__search" onSubmit={searchPlace}>
              <input
                type="text"
                placeholder="Search for a city"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
              />
              <button type="submit" className="button button--ghost" disabled={placeSearching || !placeQuery.trim()}>
                Search
              </button>
            </form>

            {placeError && <p className="location-settings__error">{placeError}</p>}

            {placeResults.length > 0 && (
              <ul className="location-settings__results">
                {placeResults.map((place) => (
                  <li key={`${place.lat},${place.lon}`}>
                    <button
                      type="button"
                      className="location-settings__result"
                      disabled={locationBusy}
                      onClick={() => choosePlace(place)}
                    >
                      {place.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {CAN_USE_GEOLOCATION && (
              <button
                type="button"
                className="button button--ghost location-settings__geo"
                disabled={locationBusy}
                onClick={useMyLocation}
              >
                Use my location instead
              </button>
            )}

            {settings.location && (!settings.sunrise || !settings.sunset) && (
              <p className="location-settings__times">
                The sun doesn't rise or set today at this location — staying on dark.
              </p>
            )}

            <div className="advanced-toggle">
              <span className="advanced-toggle__label">Advanced</span>
              <label className="switch">
                <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
                <span className="switch__track" />
              </label>
            </div>

            {showAdvanced && settings.location && settings.sunrise && settings.sunset && (
              <div className="sun-offsets">
                <SunOffsetRow
                  title="Sunrise"
                  time={settings.sunrise}
                  offset={settings.sunriseOffset}
                  disabled={settingsLoading}
                  onChange={(offset) => setOffset('sunriseOffset', offset)}
                />
                <SunOffsetRow
                  title="Sunset"
                  time={settings.sunset}
                  offset={settings.sunsetOffset}
                  disabled={settingsLoading}
                  onChange={(offset) => setOffset('sunsetOffset', offset)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <header className="page__header page__header--sub">
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

      <header className="page__header page__header--section page__header--sub">
        <h1>Microsoft To Do Reminders</h1>
        <p className="page__subtitle">Choose which lists show up on the display — including ones shared with you.</p>
      </header>

      {!todoLoading && !msAccount && (
        <p className="banner">No Microsoft account connected yet. Add one below to get started.</p>
      )}

      {msAccount && (
        <section className="account-card">
          <div className="account-card__header">
            <h2>{msAccount.email}</h2>
            <div className="account-card__actions">
              <button className="button button--ghost" disabled={todoBusy} onClick={refreshTodoLists}>
                Refresh lists
              </button>
              <button
                className="button button--danger"
                disabled={todoBusy}
                onClick={() => disconnectMsAccount(msAccount.email)}
              >
                Disconnect
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
            {todoLists.length === 0 && <li className="calendar-row calendar-row--empty">No lists found.</li>}
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
