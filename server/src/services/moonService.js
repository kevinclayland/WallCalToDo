// Moon phase for the weather widget's night-time icon — like sunService.js,
// deliberately computed locally rather than fetched, since it's cheap pure
// math and the phase visible is the same worldwide on a given date (no
// location/API call needed at all).
//
// Reference new moon: 2000-01-06 18:14 UTC, a commonly-cited epoch for this
// calculation. Dividing the time since then by the synodic month's average
// length (new moon to new moon) gives a 0-1 fraction through the current
// cycle; bucketing that into 8 equal slices distinguishes waxing from
// waning (an ambiguity a cruder "days until full/new" calculation wouldn't
// resolve), which is the granularity the display actually wants.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const SYNODIC_MONTH_MS = 29.53058867 * 86400000;

const PHASES = [
  { name: 'New Moon', emoji: '🌑' },
  { name: 'Waxing Crescent', emoji: '🌒' },
  { name: 'First Quarter', emoji: '🌓' },
  { name: 'Waxing Gibbous', emoji: '🌔' },
  { name: 'Full Moon', emoji: '🌕' },
  { name: 'Waning Gibbous', emoji: '🌖' },
  { name: 'Last Quarter', emoji: '🌗' },
  { name: 'Waning Crescent', emoji: '🌘' },
];

// { name, emoji } for the moon phase on the given date (defaults to now).
export function getMoonPhase(date = new Date()) {
  const cyclesSinceKnownNewMoon = (date.getTime() - KNOWN_NEW_MOON_MS) / SYNODIC_MONTH_MS;
  const fraction = cyclesSinceKnownNewMoon - Math.floor(cyclesSinceKnownNewMoon); // 0 (new) .. 1 (next new)
  const index = Math.round(fraction * 8) % 8;
  return PHASES[index];
}
