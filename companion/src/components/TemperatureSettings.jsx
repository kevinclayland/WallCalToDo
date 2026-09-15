const TEMP_OPTIONS = [
  { value: 'F', label: '°F' },
  { value: 'C', label: '°C' },
];

// Which unit the outside-temperature display uses. Disabled (with an
// explanatory notice) until a location is set -- there's nothing to show
// units for without one, since the reading itself comes from that location.
export default function TemperatureSettings({ settings, settingsLoading, onSetTempUnit }) {
  const disabled = settingsLoading || !settings?.location;
  return (
    <div className="temperature-settings">
      <p className="settings-label section-label">Temperature</p>
      <div className="segmented" role="group" aria-label="Temperature unit">
        {TEMP_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`segmented__option${settings?.tempUnit === value ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => onSetTempUnit(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {!settings?.location && <p className="settings-notice">Set a location to see the temperature.</p>}
    </div>
  );
}
