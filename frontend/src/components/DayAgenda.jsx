import { useEffect, useState } from 'react';
import { dateKey, formatClock, ordinalSuffix, parseLocalDate, sortDayEvents } from '../utils/date.js';

// Always shows *today* — this display has no touch input, so there's no
// way to select a different day, and none is needed.
export default function DayAgenda({ events }) {
  // `now` needs its own clock, not just a value computed at render time:
  // this component only re-renders when `events` changes, which can be
  // hours between calendar updates. Without a timer, "today" would stay
  // frozen at whenever that last render happened — so once midnight
  // passed with no calendar changes, this kept showing yesterday's
  // events instead of the (now-empty) actual today. Matches the same
  // pattern CalendarView already uses for its own clock/today-highlight.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = dateKey(now);
  const todayEvents = sortDayEvents(events.filter((event) => dateKey(parseLocalDate(event.start)) === todayKey));

  const heading = `${now.toLocaleDateString(undefined, { weekday: 'long' })}, ${now.toLocaleDateString(undefined, { month: 'long' })} ${now.getDate()}${ordinalSuffix(now.getDate())}`;

  return (
    <section className="agenda">
      <h2 className="agenda__heading">{heading}</h2>
      {todayEvents.length === 0 ? (
        <p className="view__empty">Nothing on the calendar today.</p>
      ) : (
        <ul className="agenda__list">
          {todayEvents.map((event) => (
            <li key={event.id} className="agenda__item">
              <span className="agenda__time">{event.allDay ? 'All day' : formatClock(new Date(event.start))}</span>
              <span className="event-pill agenda__pill" style={{ '--event-color': event.color || 'var(--color-accent)' }}>
                {event.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
