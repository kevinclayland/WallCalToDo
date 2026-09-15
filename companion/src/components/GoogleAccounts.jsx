import { CAN_ADD_ACCOUNTS } from '../constants.js';

// Google Calendar section: per-account calendar lists with enable toggles,
// plus connect/refresh/disconnect actions.
export default function GoogleAccounts({ accounts, loading, error, busyAccountId, onToggleCalendar, onRefreshAccount, onDisconnectAccount }) {
  return (
    <>
      <header className="page__header page__header--gap page__header--sub">
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
                  onClick={() => onRefreshAccount(account.id)}
                >
                  Refresh calendars
                </button>
                <button
                  className="button button--danger"
                  disabled={busyAccountId === account.id}
                  onClick={() => onDisconnectAccount(account.id, account.email)}
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
                      onChange={(e) => onToggleCalendar(account.id, cal.id, e.target.checked)}
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
    </>
  );
}
