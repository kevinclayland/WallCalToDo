import { CAN_ADD_ACCOUNTS } from '../constants.js';
import ApiCredentialsForm from './ApiCredentialsForm.jsx';

const GOOGLE_HELP_STEPS = [
  <>
    Go to the{' '}
    <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
      Google Cloud Console
    </a>{' '}
    and create a project (any name is fine).
  </>,
  <>
    <strong>APIs &amp; Services → Library</strong>, search "Google Calendar API", click <strong>Enable</strong>.
  </>,
  <>
    <strong>APIs &amp; Services → OAuth consent screen</strong>: choose <strong>External</strong>, fill in an app
    name and your email, save. Under <strong>Test users</strong>, add every Google account you plan to connect.
  </>,
  <>
    <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth client ID</strong>. Application type:{' '}
    <strong>Web application</strong>.
  </>,
];

// Google Calendar section: the credentials this deployment needs before it
// can connect any account at all, then per-account calendar lists with
// enable toggles, plus connect/refresh/disconnect actions.
export default function GoogleAccounts({
  accounts,
  loading,
  busyAccountId,
  credentialsStatus,
  onSaveCredentials,
  onToggleCalendar,
  onRefreshAccount,
  onDisconnectAccount,
}) {
  const configured = Boolean(credentialsStatus?.configured);

  return (
    <>
      <header className="page__header page__header--gap page__header--sub">
        <h1>Google Calendar</h1>
        <p className="page__subtitle">Manage which Google calendars show up on the display.</p>
      </header>

      {/* Not rendered until the real status has loaded -- ApiCredentialsForm
          picks its initial collapsed/expanded state from `status` only
          once, on mount, so mounting it early with a still-loading
          `undefined` would leave it stuck expanded even after the real
          "already configured" status arrives a moment later. */}
      {credentialsStatus && (
        <ApiCredentialsForm
          providerLabel="Google"
          redirectUri="http://localhost:3000/auth/google/callback"
          helpSteps={GOOGLE_HELP_STEPS}
          status={credentialsStatus}
          onSave={onSaveCredentials}
        />
      )}

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

      {!configured ? (
        <p className="add-account-note">Enter your Google API credentials above before connecting an account.</p>
      ) : CAN_ADD_ACCOUNTS ? (
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
