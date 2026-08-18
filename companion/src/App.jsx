import { useCallback, useEffect, useState } from 'react';

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyAccountId, setBusyAccountId] = useState(null);

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

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

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

  return (
    <div className="page">
      <header className="page__header">
        <h1>WallCalToDo</h1>
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

      <a className="button button--primary add-account" href="/auth/google">
        + Add Google account
      </a>
    </div>
  );
}
