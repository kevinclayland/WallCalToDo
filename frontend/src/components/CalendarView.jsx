// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, start, end, allDay, location, calendarLabel, color }]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_PER_DAY = 3;

// Google sends all-day events as a plain "2026-08-21" date with no time or
// timezone. Handing that straight to `new Date()` parses it as UTC
// midnight, which then prints as the *previous* day in any timezone west
// of UTC — so all-day events would land in the wrong grid cell. Parsing
// the components ourselves keeps it a local calendar date.
function parseLocalDate(value) {
  if (value.length === 10) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Full weeks (multiples of 7 cells) covering the given month, padded with
// the tail end of the previous month and the start of the next so every
// row is a complete week.
function buildMonthGrid(year, month) {
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

export default function CalendarView({ events }) {
  const today = new Date();
  const todayKey = dateKey(today);
  const cells = buildMonthGrid(today.getFullYear(), today.getMonth());
  const weekCount = cells.length / 7;
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const eventsByDay = {};
  for (const event of events) {
    // Multi-day all-day events only get placed on their start date for
    // now — spanning a bar across cells is a layout decision better left
    // to the real design.
    const key = dateKey(parseLocalDate(event.start));
    (eventsByDay[key] ||= []).push(event);
  }

  return (
    <section className="view view--calendar">
      <h1 className="view__title">{monthLabel}</h1>
      <div className="calendar-grid" style={{ gridTemplateRows: `auto repeat(${weekCount}, 1fr)` }}>
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-grid__weekday">
            {day}
          </div>
        ))}
        {cells.map(({ date, inMonth }) => {
          const key = dateKey(date);
          const dayEvents = eventsByDay[key] || [];
          const hiddenCount = dayEvents.length - MAX_VISIBLE_PER_DAY;
          return (
            <div
              key={key}
              className={[
                'calendar-cell',
                inMonth ? '' : 'calendar-cell--outside',
                key === todayKey ? 'calendar-cell--today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="calendar-cell__day">{date.getDate()}</span>
              <ul className="calendar-cell__events">
                {dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((event) => (
                  <li
                    key={event.id}
                    className="calendar-cell__event"
                    style={{ '--event-color': event.color || 'var(--color-accent)' }}
                    title={event.title}
                  >
                    {event.title}
                  </li>
                ))}
                {hiddenCount > 0 && <li className="calendar-cell__more">+{hiddenCount} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
