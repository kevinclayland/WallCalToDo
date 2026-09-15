import { useState } from 'react';

// Shared by GoogleAccounts.jsx and MicrosoftTodo.jsx -- same shape of
// problem for both: before you can connect an account, this deployment's
// own Google/Microsoft app needs to exist somewhere, and its Client ID/
// Secret need to live on the server. This used to mean SSH'ing in and
// hand-editing server/.env; now it's a form right here instead, with the
// exact steps to get those two values inlined so nobody has to leave the
// app to figure out what to paste in.
//
// The secret is write-only by design: once saved, the server never sends
// it back out (see credentialsService.getCredentialsStatus on the
// backend) -- `status.configured` is all this has to go on to know one's
// already on file, and the field just stays blank until you type a new
// one.
export default function ApiCredentialsForm({ providerLabel, redirectUri, helpSteps, status, onSave }) {
  const [expanded, setExpanded] = useState(!status?.configured);
  const [clientId, setClientId] = useState(status?.clientId || '');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
      setClientSecret('');
      setExpanded(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="api-credentials">
      <div className="api-credentials__header">
        <p className="settings-label section-label">{providerLabel} API credentials</p>
        {status?.configured && !expanded && (
          <button type="button" className="link-button" onClick={() => setExpanded(true)}>
            Edit
          </button>
        )}
      </div>

      {status?.configured && !expanded ? (
        <p className="api-credentials__status">Configured — Client ID ends in “…{status.clientId.slice(-6)}”.</p>
      ) : (
        <>
          <details className="api-credentials__help">
            <summary>Where do I get this?</summary>
            <ol>
              {helpSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
              <li>
                Under authorized redirect URIs, add exactly: <code>{redirectUri}</code>
              </li>
              <li>Copy the Client ID and Client Secret it gives you into the fields below.</li>
            </ol>
          </details>
          <form className="api-credentials__form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Client ID"
              value={clientId}
              disabled={saving}
              onChange={(e) => setClientId(e.target.value)}
            />
            <input
              type="password"
              placeholder="Client Secret"
              value={clientSecret}
              disabled={saving}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <button
              type="submit"
              className="button button--primary"
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
            >
              Save
            </button>
          </form>
          {error && <p className="banner banner--error">{error}</p>}
        </>
      )}
    </div>
  );
}
