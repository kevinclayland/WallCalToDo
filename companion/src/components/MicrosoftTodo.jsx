import { CAN_ADD_ACCOUNTS } from '../constants.js';
import ApiCredentialsForm from './ApiCredentialsForm.jsx';

const MICROSOFT_HELP_STEPS = [
  <>
    Go to the{' '}
    <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade" target="_blank" rel="noreferrer">
      Azure Portal → App registrations → New registration
    </a>
    .
  </>,
  <>
    Under <strong>Redirect URI</strong>, choose platform <strong>Web</strong>.
  </>,
  <>
    <strong>Certificates &amp; secrets → New client secret</strong> — copy its value immediately, it's only shown
    once.
  </>,
  <>
    <strong>API permissions → Add a permission → Microsoft Graph → Delegated permissions</strong>, search for and
    add <code>Tasks.Read</code>.
  </>,
];

// Microsoft To Do section: the credentials this deployment needs before it
// can connect an account, then the connected account's lists (including
// ones shared with you) with enable toggles, plus connect/refresh/
// disconnect actions. Only ever one account, unlike Google's list of
// accounts.
export default function MicrosoftTodo({
  todoLists,
  todoLoading,
  todoBusy,
  msAccount,
  credentialsStatus,
  onSaveCredentials,
  onToggleTodoList,
  onRefreshTodoLists,
  onDisconnectMsAccount,
}) {
  const configured = Boolean(credentialsStatus?.configured);

  return (
    <>
      <header className="page__header page__header--section page__header--sub">
        <h1>Microsoft To Do Reminders</h1>
        <p className="page__subtitle">Choose which lists show up on the display — including ones shared with you.</p>
      </header>

      {/* See the matching comment in GoogleAccounts.jsx -- not rendered
          until the real status has loaded, so it doesn't lock in a stale
          "expanded" state from a still-loading `undefined`. */}
      {credentialsStatus && (
        <ApiCredentialsForm
          providerLabel="Microsoft"
          redirectUri="http://localhost:3000/auth/microsoft/callback"
          helpSteps={MICROSOFT_HELP_STEPS}
          status={credentialsStatus}
          onSave={onSaveCredentials}
        />
      )}

      {!todoLoading && !msAccount && (
        <p className="banner">No Microsoft account connected yet. Add one below to get started.</p>
      )}

      {msAccount && (
        <section className="account-card">
          <div className="account-card__header">
            <h2>{msAccount.email}</h2>
            <div className="account-card__actions">
              <button className="button button--ghost" disabled={todoBusy} onClick={onRefreshTodoLists}>
                Refresh lists
              </button>
              <button
                className="button button--danger"
                disabled={todoBusy}
                onClick={() => onDisconnectMsAccount(msAccount.email)}
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
                    onChange={(e) => onToggleTodoList(list.id, e.target.checked)}
                  />
                  <span className="switch__track" />
                </label>
              </li>
            ))}
            {todoLists.length === 0 && <li className="calendar-row calendar-row--empty">No lists found.</li>}
          </ul>
        </section>
      )}

      {!configured ? (
        <p className="add-account-note">Enter your Microsoft API credentials above before connecting an account.</p>
      ) : CAN_ADD_ACCOUNTS ? (
        <a className="button button--primary add-account" href="/auth/microsoft">
          + Connect Microsoft account
        </a>
      ) : (
        <p className="add-account-note">
          You can only connect a new Microsoft account on the Pi's own screen — open{' '}
          <code>http://localhost:3000/companion</code> there.
        </p>
      )}
    </>
  );
}
