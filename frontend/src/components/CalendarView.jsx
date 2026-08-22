import { useEffect, useState } from 'react';
import { WEEKDAYS, buildMonthGrid, dateKey, formatClock, parseLocalDate, sortDayEvents } from '../utils/date.js';

// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, start, end, allDay, location, calendarLabel, color }]

// A fixed cap is an approximation — how many events actually fit depends
// on the real viewport size and how many wrap to multiple lines, which we
// can't know at build time. 3 is conservative enough to reliably avoid
// silently clipping a partial event; tune this once viewed on real
// hardware, or replace with a runtime-measured fit if it needs to be exact.
const MAX_VISIBLE_PER_DAY = 3;

export default function CalendarView({ events, connected }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = dateKey(now);
  const cells = buildMonthGrid(now.getFullYear(), now.getMonth());
  const weekCount = cells.length / 7;

  const eventsByDay = {};
  for (const event of events) {
    const key = dateKey(parseLocalDate(event.start));
    (eventsByDay[key] ||= []).push(event);
  }

  return (
    <section className="calendar-section">
      <div className="calendar-header">
        <h1 className="calendar-header__date">
          <span className="calendar-header__month">{now.toLocaleDateString(undefined, { month: 'long' })}</span>
          <span className="calendar-header__year"> {now.getFullYear()}</span>
        </h1>
        <div className="calendar-header__right">
          <span className={`calendar-header__dot ${connected ? 'is-connected' : 'is-disconnected'}`} />
          <span className="calendar-header__clock">{formatClock(now)}</span>
        </div>
      </div>

      <div className="calendar-grid" style={{ gridTemplateRows: `auto repeat(${weekCount}, minmax(0, 1fr))` }}>
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-grid__weekday">
            {day}
          </div>
        ))}
        {cells.map(({ date, inMonth }) => {
          const key = dateKey(date);
          const dayEvents = sortDayEvents(eventsByDay[key] || []);
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
                  <li key={event.id} className="calendar-cell__event" title={event.title}>
                    <span
                      className="calendar-cell__event-dot"
                      style={{ '--event-color': event.color || 'var(--color-accent)' }}
                    />
                    <span className="calendar-cell__event-title">{event.title}</span>
                  </li>
                ))}
              </ul>
              {/* Pinned outside the (overflow-clipped) events list so it's
                  always fully visible — if space is tight, an event's text
                  gets clipped before this ever would. */}
              {hiddenCount > 0 && <span className="calendar-cell__more">+{hiddenCount} more</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
