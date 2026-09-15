import LocationSettings from './LocationSettings.jsx';
import ThemeSettings from './ThemeSettings.jsx';
import TemperatureSettings from './TemperatureSettings.jsx';

// Privacy, then location (shared by theme and temperature below, so it
// comes before both), then theme, then temperature units.
export default function GeneralSettings({
  settings,
  settingsLoading,
  onSetPrivacyMode,
  onSetTheme,
  onSetAdvancedEnabled,
  onSetOffset,
  onSetTempUnit,
  onSaveLocation,
  onError,
}) {
  return (
    <section className="settings-card">
      <div className="privacy-toggle">
        <span className="settings-label">Privacy mode</span>
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

      <LocationSettings settings={settings} onSaveLocation={onSaveLocation} onError={onError} />

      <ThemeSettings
        settings={settings}
        settingsLoading={settingsLoading}
        onSetTheme={onSetTheme}
        onSetAdvancedEnabled={onSetAdvancedEnabled}
        onSetOffset={onSetOffset}
      />

      <TemperatureSettings settings={settings} settingsLoading={settingsLoading} onSetTempUnit={onSetTempUnit} />
    </section>
  );
}
