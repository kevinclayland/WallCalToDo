// Small debug strip — useful while wall-mounted with no obvious way to
// check "is this thing actually alive." Safe to remove/restyle in the
// real design.
export default function StatusBar({ connected }) {
  return (
    <div className="status-bar">
      <span className={`status-bar__dot ${connected ? 'is-connected' : 'is-disconnected'}`} />
      <span className="status-bar__label">{connected ? 'Live' : 'Reconnecting…'}</span>
    </div>
  );
}
