import SunOffsetRow from './SunOffsetRow.jsx';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Automatic' },
];

// Theme picker, plus (only when Automatic is selected) the sunrise/sunset
// timing controls that theme needs -- the location itself now lives in its
// own always-visible LocationSettings section above, so Automatic here
// either shows those timing controls (a location is set) or a notice
// telling you to go set one (it isn't), instead of the search box that
// used to live in this same spot.
export default function ThemeSettings({ settings, settingsLoading, onSetTheme, onSetAdvancedEnabled, onSetOffset }) {
  return (
    <div className="theme-settings">
      <p className="settings-label section-label">Theme</p>
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

      {settings?.theme === 'auto' && !settings?.location && (
        <p className="settings-notice">Set a location to use automatic.</p>
      )}

      {settings?.theme === 'auto' && settings?.location && (
        <div className="theme-auto-settings">
          {(!settings.sunrise || !settings.sunset) && (
            <p className="location-settings__times">
              The sun doesn't rise or set today at this location — staying on dark.
            </p>
          )}

          <div className="advanced-toggle">
            <span className="advanced-toggle__label">Advanced</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={Boolean(settings.advancedEnabled)}
                onChange={(e) => onSetAdvancedEnabled(e.target.checked)}
              />
              <span className="switch__track" />
            </label>
          </div>

          {settings.advancedEnabled && settings.sunrise && settings.sunset && (
            <div className="sun-offsets">
              <SunOffsetRow
                title="Sunrise"
                time={settings.sunrise}
                offset={settings.sunriseOffset}
                disabled={settingsLoading}
                onChange={(offset) => onSetOffset('sunriseOffset', offset)}
              />
              <SunOffsetRow
                title="Sunset"
                time={settings.sunset}
                offset={settings.sunsetOffset}
                disabled={settingsLoading}
                onChange={(offset) => onSetOffset('sunsetOffset', offset)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
