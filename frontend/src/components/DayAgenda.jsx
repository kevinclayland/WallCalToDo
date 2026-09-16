import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { dateKey, formatClock, ordinalSuffix, parseLocalDate, sortDayEvents } from '../utils/date.js';
import Legend from './Legend.jsx';

// The agenda list's own default text size (matches the design), and the
// smallest it's ever allowed to shrink to on a day packed with events —
// deliberately the same font-size the calendar's own per-day event pills
// use (.calendar-cell__event in base.css), so a busy agenda never reads
// smaller than a calendar pill already does.
const AGENDA_FONT_MAX = 22;
const AGENDA_FONT_MIN = 12;

// Always shows *today* — this display has no touch input, so there's no
// way to select a different day, and none is needed.
export default function DayAgenda({ events, privacyMode }) {
  // `now` needs its own clock, not just a value computed at render time:
  // this component only re-renders when `events` changes, which can be
  // hours between calendar updates. Without a timer, "today" would stay
  // frozen at whenever that last render happened — so once midnight
  // passed with no calendar changes, this kept showing yesterday's
  // events instead of the (now-empty) actual today. Matches the same
  // pattern CalendarView already uses for its own clock/today-highlight.
  const [now, setNow] = useState(() => new Date());
  const listRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = dateKey(now);
  const todayEvents = sortDayEvents(events.filter((event) => dateKey(parseLocalDate(event.start)) === todayKey));
  const eventsSignature = todayEvents.map((event) => event.id).join(',');

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Binary-search the largest font-size in [MIN, MAX] whose natural
    // content height still fits without scrolling. Every size in
    // between only needs setting one CSS variable — pill padding, pill
    // radius, and the time column's width are all sized in em off of
    // it (see .agenda__list/.agenda__pill/.agenda__time in base.css) —
    // so the whole row scales together instead of the pill text and
    // its time column drifting out of proportion with each other.
    let lo = AGENDA_FONT_MIN;
    let hi = AGENDA_FONT_MAX;
    let best = AGENDA_FONT_MIN;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      list.style.setProperty('--agenda-font-size', `${mid}px`);
      if (list.scrollHeight <= list.clientHeight + 0.5) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    list.style.setProperty('--agenda-font-size', `${best}px`);
    // Re-runs whenever today's actual event set changes — a plain
    // `[todayEvents]` dependency would also re-run on every 30s clock
    // tick (new array reference each render even with the same
    // content), so keyed off a stable id-list string instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsSignature]);

  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = `${now.toLocaleDateString(undefined, { month: 'long' })} ${now.getDate()}${ordinalSuffix(now.getDate())}`;

  return (
    <section className="agenda">
      {/* Landscape's agenda panel is narrow enough that "Weekday, Month
          Dayth" can wrap mid-phrase (e.g. "Tuesday, September" / "15th")
          -- these two spans render inline here (a plain single line,
          wrapping only if it truly doesn't fit) and only get forced onto
          their own deliberate two lines in landscape, via CSS -- see
          .agenda__heading-day/-date in base.css. Portrait has room for
          the whole thing on one line and stays that way. */}
      <h2 className="agenda__heading">
        <span className="agenda__heading-day">{weekday},</span> <span className="agenda__heading-date">{monthDay}</span>
      </h2>
      {privacyMode ? (
        <p className="view__empty">Privacy mode activated</p>
      ) : todayEvents.length === 0 ? (
        <p className="view__empty">Nothing on the calendar today.</p>
      ) : (
        <ul className="agenda__list" ref={listRef}>
          {todayEvents.map((event) => {
            // Dimmed once it's over -- checked against the *end* time only,
            // never the start, so an event you're currently in the middle
            // of stays fully visible. All-day events are exempt entirely:
            // they don't have a real "end time" the way a timed event
            // does, so they stay fully visible all day regardless of `now`.
            const isPast = !event.allDay && now >= new Date(event.end);
            return (
              <li key={event.id} className={`agenda__item${isPast ? ' agenda__item--past' : ''}`}>
                <span className="agenda__time">{event.allDay ? 'All day' : formatClock(new Date(event.start))}</span>
                <span className="event-pill agenda__pill" style={{ '--event-color': event.color || 'var(--color-accent)' }}>
                  {event.title}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* Hidden in privacy mode too — it names calendars (e.g. "Family")
          and their colors, which is exactly the kind of at-a-glance info
          privacy mode is meant to hide. A real flex sibling here (not
          absolutely positioned) rather than floating over the content:
          .agenda's flex column naturally reserves its real height, so the
          event list above it (flex: 1) already shrinks to leave room for
          it instead of the two ever overlapping. */}
      {!privacyMode && <Legend events={events} />}
    </section>
  );
}
