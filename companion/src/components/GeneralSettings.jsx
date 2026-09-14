import LocationSettings from './LocationSettings.jsx';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Automatic' },
];

// Privacy mode + theme, plus (only in Automatic mode) the location/
// sunrise-sunset controls that theme needs.
export default function GeneralSettings({
  settings,
  settingsLoading,
  onSetPrivacyMode,
  onSetTheme,
  onSetAdvancedEnabled,
  onSetOffset,
  onSaveLocation,
  onError,
}) {
  return (
    <section className="settings-card">
      <div className="privacy-toggle">
        <span className="privacy-toggle__label">Privacy mode</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(settings?.privacyMode)}
            disabled={settingsLoading}
            onChange={(e) => onSetPrivacyMode(e.target.checked)}
          />
          <span className="switch__track" />
        </label>
      </div>
      <p className="privacy-toggle__hint">
        Hides event titles (only their colored pills stay visible) and replaces today's agenda and the to-do
        list with a placeholder notice on the wall display.
      </p>

      <div className="segmented" role="group" aria-label="Theme">
        {THEME_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`segmented__option${settings?.theme === value ? ' is-active' : ''}`}
            disabled={settingsLoading}
            onClick={() => onSetTheme(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {settings?.theme === 'auto' && (
        <LocationSettings
          settings={settings}
          settingsLoading={settingsLoading}
          onSaveLocation={onSaveLocation}
          onSetAdvancedEnabled={onSetAdvancedEnabled}
          onSetOffset={onSetOffset}
          onError={onError}
        />
      )}
    </section>
  );
}
