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
export default function SunOffsetRow({ title, time, offset, disabled, onChange }) {
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
