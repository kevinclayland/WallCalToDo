// City-name lookup for the companion app's "search for a city" location
// picker, and reverse lookup for a friendly label after "Use my location".
// Backed by OpenStreetMap's Nominatim — free, no API key/signup required.
// This runs server-side (not called directly from the browser) so a
// descriptive User-Agent can be sent, per Nominatim's usage policy, and so
// it isn't subject to CORS. Each call here is one person pressing "Search"
// or "Use my location" during setup — nowhere near Nominatim's "no bulk/
// automated use" limit.
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WallCalToDo (github.com/kevinclayland/WallCalToDo)';

async function nominatimFetch(path) {
  const res = await fetch(`${NOMINATIM_BASE}${path}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Geocoding lookup failed (${res.status})`);
  return res.json();
}

// [{ label, lat, lon }] — up to 5 matches for a free-text place search.
export async function searchPlaces(query) {
  const data = await nominatimFetch(`/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
  return data.map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lon: parseFloat(r.lon) }));
}

// A friendly label for a lat/lon (used after browser geolocation, which
// only gives raw coordinates) — null if Nominatim has nothing for it.
export async function reverseGeocode(lat, lon) {
  const data = await nominatimFetch(`/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`);
  return data.display_name || null;
}
