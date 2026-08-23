export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Google sends all-day events as a plain "2026-08-21" date with no time or
// timezone. Handing that straight to `new Date()` parses it as UTC
// midnight, which then prints as the *previous* day in any timezone west
// of UTC. Parsing the components ourselves keeps it a local calendar date.
export function parseLocalDate(value) {
  if (value.length === 10) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function addDays(date, delta) {
  const result = new Date(date);
  result.setDate(result.getDate() + delta);
  return result;
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// All-day events first, then timed events in start-time order.
export function sortDayEvents(events) {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (a.allDay) return a.title.localeCompare(b.title);
    return new Date(a.start) - new Date(b.start);
  });
}

// Full weeks (multiples of 7 cells) covering the given month, padded with
// the tail end of the previous month and the start of the next so every
// row is a complete week.
export function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const next = new Date(cells[cells.length - 1].date);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

export function ordinalSuffix(day) {
  if (day % 10 === 1 && day % 100 !== 11) return 'st';
  if (day % 10 === 2 && day % 100 !== 12) return 'nd';
  if (day % 10 === 3 && day % 100 !== 13) return 'rd';
  return 'th';
}

// "5:21 pm" — 12-hour, lowercase am/pm, no seconds. toLocaleTimeString()
// varies by locale/browser; spelling this out keeps it exact.
export function formatClock(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
}
