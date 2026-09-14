import { useState } from 'react';
import { api } from '../api.js';
import SunOffsetRow from './SunOffsetRow.jsx';

// Browser geolocation is only available in a secure context (https:, or the
// localhost/127.0.0.1 exception) — same underlying restriction as the OAuth
// callback's, different mechanism. Off the Pi's own screen (plain http
// over the LAN), the API itself won't be there to call.
const CAN_USE_GEOLOCATION = typeof navigator !== 'undefined' && Boolean(navigator.geolocation) && window.isSecureContext;

// The location + sunrise/sunset half of Automatic theme mode — only ever
// rendered when settings.theme === 'auto' (see GeneralSettings), so
// `settings` here is guaranteed non-null. Owns all of its own UI-local
// state (search box, results, busy flags); the only things that need to
// reach back up to the shared settings object are the on* callbacks
// App.jsx supplies.
export default function LocationSettings({ settings, settingsLoading, onSaveLocation, onSetAdvancedEnabled, onSetOffset, onError }) {
  const [locationBusy, setLocationBusy] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeError, setPlaceError] = useState(null);

  async function runSaveLocation(lat, lon, label) {
    setLocationBusy(true);
    try {
      await onSaveLocation(lat, lon, label);
    } finally {
      setLocationBusy(false);
    }
  }

  // Zero-typing option when it's available — but only works in a secure
  // context (see CAN_USE_GEOLOCATION), so city search below is the one that
  // works from anywhere, including a phone setting this up over plain LAN
  // http.
  function useMyLocation() {
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let label;
        try {
          label = (await api(`/geocode/reverse?lat=${latitude}&lon=${longitude}`)).label;
        } catch {
          // Non-fatal — still save the coordinates, just without a
          // friendly name to show for them.
        }
        try {
          await onSaveLocation(latitude, longitude, label);
        } finally {
          setLocationBusy(false);
        }
      },
      (err) => {
        onError(`Couldn't get your location: ${err.message}`);
        setLocationBusy(false);
      }
    );
  }

  async function searchPlace(e) {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceSearching(true);
    setPlaceError(null);
    try {
      const { results } = await api(`/geocode?q=${encodeURIComponent(q)}`);
      setPlaceResults(results);
      if (results.length === 0) setPlaceError("No matches — try a different search.");
    } catch (err) {
      setPlaceError(err.message);
    } finally {
      setPlaceSearching(false);
    }
  }

  function choosePlace(place) {
    setPlaceResults([]);
    setPlaceQuery('');
    runSaveLocation(place.lat, place.lon, place.label);
  }

  return (
    <div className="location-settings">
      <p className="location-settings__hint">
        Automatic switches between light and dark at sunrise and sunset for this location.
      </p>

      {settings.location && (
        <p className="location-settings__current">
          Currently set to{' '}
          <strong>{settings.location.label || `${settings.location.lat.toFixed(2)}, ${settings.location.lon.toFixed(2)}`}</strong>
        </p>
      )}

      <form className="location-settings__search" onSubmit={searchPlace}>
        <input
          type="text"
          placeholder="Search for a city"
          value={placeQuery}
          onChange={(e) => setPlaceQuery(e.target.value)}
        />
        <button type="submit" className="button button--ghost" disabled={placeSearching || !placeQuery.trim()}>
          Search
        </button>
      </form>

      {placeError && <p className="location-settings__error">{placeError}</p>}

      {placeResults.length > 0 && (
        <ul className="location-settings__results">
          {placeResults.map((place) => (
            <li key={`${place.lat},${place.lon}`}>
              <button
                type="button"
                className="location-settings__result"
                disabled={locationBusy}
                onClick={() => choosePlace(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {CAN_USE_GEOLOCATION && (
        <button
          type="button"
          className="button button--ghost location-settings__geo"
          disabled={locationBusy}
          onClick={useMyLocation}
        >
          Use my location instead
        </button>
      )}

      {settings.location && (!settings.sunrise || !settings.sunset) && (
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

      {settings.advancedEnabled && settings.location && settings.sunrise && settings.sunset && (
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
  );
}
