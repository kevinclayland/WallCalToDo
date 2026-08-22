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

  const [todoLists, setTodoLists] = useState([]);
  const [todoLoading, setTodoLoading] = useState(true);
  const [todoBusy, setTodoBusy] = useState(false);

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
  }, [loadAccounts, loadTodoLists]);

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

      <header className="page__header page__header--section">
        <h1>Microsoft To Do</h1>
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

      <a className="button button--primary add-account" href="/auth/microsoft">
        + Connect Microsoft account
      </a>
    </div>
  );
}
