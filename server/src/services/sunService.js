// Sunrise/sunset calculation for "Automatic" theme mode. Deliberately not an
// external API call — the Pi has no guaranteed always-on internet access
// story beyond polling Google/Microsoft, and this doesn't need one: it's
// the public-domain "sunrise equation" (as popularized by sunrise-sunset.org
// and the US Naval Observatory almanac, see e.g.
// https://edwilliams.org/sunrise_sunset_algorithm.html), accurate to within
// a minute or two — plenty for deciding "is it currently day or night".

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function normalizeDegrees(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

function normalizeHours(hours) {
  const h = hours % 24;
  return h < 0 ? h + 24 : h;
}

// Returns fractional UTC hours (0-24), or null if the sun doesn't rise/set
// that day at this latitude (polar day/night).
function calcSunUtcHours(lat, lon, year, month, day, isSunrise) {
  const zenith = 90.833; // 90deg + atmospheric refraction + the sun's own radius

  const N1 = Math.floor((275 * month) / 9);
  const N2 = Math.floor((month + 9) / 12);
  const N3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const N = N1 - N2 * N3 + day - 30;

  const lngHour = lon / 15;
  const t = isSunrise ? N + (6 - lngHour) / 24 : N + (18 - lngHour) / 24;

  const M = 0.9856 * t - 3.289;

  let L = M + 1.916 * Math.sin(toRad(M)) + 0.02 * Math.sin(2 * toRad(M)) + 282.634;
  L = normalizeDegrees(L);

  let RA = toDeg(Math.atan(0.91764 * Math.tan(toRad(L))));
  RA = normalizeDegrees(RA);

  // RA needs to be in the same quadrant as L.
  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquadrant - RAquadrant)) / 15;

  const sinDec = 0.39782 * Math.sin(toRad(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH = (Math.cos(toRad(zenith)) - sinDec * Math.sin(toRad(lat))) / (cosDec * Math.cos(toRad(lat)));
  if (cosH > 1 || cosH < -1) return null; // sun never rises / never sets here today

  let H = isSunrise ? 360 - toDeg(Math.acos(cosH)) : toDeg(Math.acos(cosH));
  H /= 15;

  const T = H + RA - 0.06571 * t - 6.622;

  return normalizeHours(T - lngHour);
}

// { sunrise, sunset } as Date objects for the given date (defaults to now,
// read using local getters so "today" matches the Pi's own local calendar
// day rather than potentially being a day off around UTC midnight) at this
// lat/lon. Either can be null if the sun doesn't rise/set that day.
//
// Assumes the saved location shares the Pi's own system timezone — true for
// the actual use case (you enter where the Pi itself lives), but means a
// location entered far outside the Pi's own timezone can get "today"'s sun
// times computed against the wrong calendar day near midnight.
export function getSunTimes(lat, lon, date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const toDate = (utcHours) => {
    if (utcHours == null) return null;
    const hours = Math.floor(utcHours);
    const minutes = Math.round((utcHours - hours) * 60);
    return new Date(Date.UTC(year, month - 1, day, hours, minutes));
  };

  return {
    sunrise: toDate(calcSunUtcHours(lat, lon, year, month, day, true)),
    sunset: toDate(calcSunUtcHours(lat, lon, year, month, day, false)),
  };
}
