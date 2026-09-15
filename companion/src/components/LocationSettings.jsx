import { useState } from 'react';
import { api } from '../api.js';

// Browser geolocation is only available in a secure context (https:, or the
// localhost/127.0.0.1 exception) — same underlying restriction as the OAuth
// callback's, different mechanism. Off the Pi's own screen (plain http
// over the LAN), the API itself won't be there to call.
const CAN_USE_GEOLOCATION = typeof navigator !== 'undefined' && Boolean(navigator.geolocation) && window.isSecureContext;

// The Pi's own physical location -- shared by Automatic theme (sunrise/
// sunset switching) and the outside-temperature display, which is why this
// is its own standalone section rather than nested under either one.
// Always rendered, unlike before, when it only showed up under theme ===
// 'auto'. Owns all of its own UI-local state (search box, results, busy
// flags); the only thing that needs to reach back up to the shared
// settings object is onSaveLocation, which App.jsx supplies.
export default function LocationSettings({ settings, onSaveLocation, onError }) {
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
      <p className="settings-label section-label">Location</p>
      <p className="location-settings__hint">Used for Automatic theme switching and the outside temperature.</p>

      {settings?.location && (
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
    </div>
  );
}
