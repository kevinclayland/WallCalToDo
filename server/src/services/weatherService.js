import { readJson, writeJson } from '../store/fileStore.js';
import { getMoonPhase } from './moonService.js';

const WEATHER_FILE = 'weather.json';

// Open-Meteo: free, no API key/signup, and it aggregates national weather
// services' own models (NOAA/NWS, DWD, Météo-France, ECMWF, ...) rather than
// running its own — accuracy in line with a paid provider, same "no key,
// generous free tier" shape as the geocoder already used for location
// search. Its separate Air Quality API (same provider, same terms) is what
// makes the "smoke from wildfires" case possible below without a second
// vendor.
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// EPA's US AQI breakpoint for "Unhealthy" (151-200) and worse — wildfire
// smoke routinely pushes AQI into this range and beyond, which is the
// "something is actually wrong with the air" threshold the mask emoji
// below is meant to flag, as opposed to the more common, healthier day to
// day range.
const UNHEALTHY_AQI = 151;

// Open-Meteo's WMO weather codes (https://open-meteo.com/en/docs) collapsed
// down to one emoji per condition family. Day/night is decided by the
// frontend (against the same sunrise/sunset already computed for Automatic
// theme, not Open-Meteo's own is_day) so this only ever needs the daytime
// reading — the moon phase below is what stands in for it at night.
function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  return res.json();
}

function loadWeather() {
  return readJson(WEATHER_FILE, null);
}

function saveWeather(weather) {
  writeJson(WEATHER_FILE, weather);
}

// Last successfully fetched reading, regardless of how stale — the display
// shows this rather than nothing while a fetch is failing (Wi-Fi hiccup,
// Open-Meteo hiccup), same "keep showing the last good state" approach as
// the calendar/todo caches.
export function getCachedWeather() {
  return loadWeather();
}

// Fetches current temperature/condition and air quality for the given
// location, computes the day's moon phase, and caches the combined
// reading. Throws on failure (caller decides what "failed" means for the
// poll loop) rather than swallowing it here, so the last good cache is
// left untouched instead of being overwritten with a null/partial one.
export async function pollWeather(lat, lon) {
  const [forecast, airQuality] = await Promise.all([
    fetchJson(`${FORECAST_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`),
    // Non-fatal on its own: a smoke alert is a nice-to-have, not worth
    // losing the whole temperature reading over if just this call fails.
    fetchJson(`${AIR_QUALITY_BASE}?latitude=${lat}&longitude=${lon}&current=us_aqi`).catch(() => null),
  ]);

  const tempC = forecast.current.temperature_2m;
  const weatherCode = forecast.current.weather_code;
  const aqi = airQuality?.current?.us_aqi ?? null;

  const weather = {
    tempC,
    tempF: Math.round((tempC * 9) / 5 + 32),
    weatherEmoji: weatherEmoji(weatherCode),
    isUnhealthyAir: aqi != null && aqi >= UNHEALTHY_AQI,
    moonPhase: getMoonPhase(),
    fetchedAt: new Date().toISOString(),
  };

  saveWeather(weather);
  return weather;
}
