import { CAN_ADD_ACCOUNTS } from '../constants.js';

// Microsoft To Do section: the connected account's lists (including ones
// shared with you) with enable toggles, plus connect/refresh/disconnect
// actions. Only ever one account, unlike Google's list of accounts.
export default function MicrosoftTodo({ todoLists, todoLoading, todoBusy, msAccount, onToggleTodoList, onRefreshTodoLists, onDisconnectMsAccount }) {
  return (
    <>
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
    </>
  );
}
