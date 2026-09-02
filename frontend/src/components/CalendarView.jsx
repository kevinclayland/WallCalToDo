import { useEffect, useState } from 'react';
import { WEEKDAYS, addDays, buildMonthGrid, dateKey, formatClock, parseLocalDate, sortDayEvents } from '../utils/date.js';

// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, start, end, allDay, location, calendarLabel, color }]

// A fixed cap is an approximation — how many events actually fit depends
// on the real viewport size and how many wrap to multiple lines, which we
// can't know at build time. 3 is conservative enough to reliably avoid
// silently clipping a partial event; tune this once viewed on real
// hardware, or replace with a runtime-measured fit if it needs to be exact.
const MAX_VISIBLE_PER_DAY = 3;

const BAR_HEIGHT = 28;
const BAR_GAP = 4;

// A day's inclusive start/end as local Date objects (midnight both ends).
function eventDateRange(event) {
  const start = parseLocalDate(event.start);
  let end = parseLocalDate(event.end || event.start);
  // Google's all-day event end date is exclusive (the day *after* the
  // event's real last day) — pull it back one so a 3-day trip's range
  // actually ends on its last real day instead of the day after.
  if (event.allDay) end = addDays(end, -1);
  return { start, end };
}

export default function CalendarView({ events, connected }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = dateKey(now);
  const cells = buildMonthGrid(now.getFullYear(), now.getMonth());
  const weekCount = cells.length / 7;
  const gridStart = cells[0].date;
  const gridEnd = cells[cells.length - 1].date;
  const indexByKey = new Map(cells.map(({ date }, i) => [dateKey(date), i]));

  // Multi-day events (trips, multi-day all-day blocks, ...) render as a
  // continuous bar across the days they cover instead of a repeated pill
  // in each day — same idea as Google Calendar's all-day event rows.
  // Anything that's only a single day still renders as a normal pill.
  const multiDayEvents = [];
  const singleDayEventsByKey = {};
  for (const event of events) {
    const { start, end } = eventDateRange(event);
    if (dateKey(start) === dateKey(end)) {
      if (start < gridStart || start > gridEnd) continue; // outside the visible month
      (singleDayEventsByKey[dateKey(start)] ||= []).push(event);
      continue;
    }
    if (end < gridStart || start > gridEnd) continue; // entirely outside the visible month
    const clippedStart = start < gridStart ? gridStart : start;
    const clippedEnd = end > gridEnd ? gridEnd : end;
    multiDayEvents.push({
      event,
      startIdx: indexByKey.get(dateKey(clippedStart)),
      endIdx: indexByKey.get(dateKey(clippedEnd)),
      // Whether the visible edge is the event's *real* start/end, or just
      // where it happens to get cut off by this month's grid — only a
      // real edge gets a rounded cap; a cut-off edge stays square, same
      // convention as it continuing into another week row.
      isRealStart: dateKey(clippedStart) === dateKey(start),
      isRealEnd: dateKey(clippedEnd) === dateKey(end),
    });
  }
  multiDayEvents.sort((a, b) => a.startIdx - b.startIdx || b.endIdx - b.startIdx - (a.endIdx - a.startIdx));

  // Lay multi-day bars out into stacking "lanes" per week row (greedy:
  // reuse the first lane whose last bar already ended before this one
  // starts), so overlapping date ranges stack instead of colliding. Every
  // day in a row reserves the same number of lanes, which keeps that
  // row's single-day pills starting at a consistent height across all 7
  // days regardless of which specific days a given bar touches.
  const bars = [];
  const laneCountByWeek = new Array(weekCount).fill(0);
  const laneEndByWeek = Array.from({ length: weekCount }, () => []);
  for (const { event, startIdx, endIdx, isRealStart, isRealEnd } of multiDayEvents) {
    const firstWeek = Math.floor(startIdx / 7);
    const lastWeek = Math.floor(endIdx / 7);
    for (let week = firstWeek; week <= lastWeek; week++) {
      const weekStart = week * 7;
      const colStart = Math.max(startIdx, weekStart) - weekStart;
      const colEnd = Math.min(endIdx, weekStart + 6) - weekStart;
      const laneEnds = laneEndByWeek[week];
      let lane = laneEnds.findIndex((endCol) => endCol < colStart);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = colEnd;
      laneCountByWeek[week] = Math.max(laneCountByWeek[week], lane + 1);
      bars.push({
        event,
        week,
        lane,
        colStart,
        colEnd,
        isStart: week === firstWeek && isRealStart,
        isEnd: week === lastWeek && isRealEnd,
      });
    }
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
        {WEEKDAYS.map((day, i) => (
          <div key={day} className="calendar-grid__weekday" style={{ gridRow: 1, gridColumn: i + 1 }}>
            {day}
          </div>
        ))}
        {cells.map(({ date, inMonth }, i) => {
          const key = dateKey(date);
          const week = Math.floor(i / 7);
          const dayEvents = sortDayEvents(singleDayEventsByKey[key] || []);
          const hiddenCount = dayEvents.length - MAX_VISIBLE_PER_DAY;
          const barsSpace = laneCountByWeek[week] * (BAR_HEIGHT + BAR_GAP);
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
              style={{ gridRow: week + 2, gridColumn: (i % 7) + 1 }}
            >
              <span className="calendar-cell__day">{date.getDate()}</span>
              <ul className="calendar-cell__events" style={barsSpace > 0 ? { marginTop: barsSpace } : undefined}>
                {dayEvents.slice(0, MAX_VISIBLE_PER_DAY).map((event) => (
                  <li
                    key={event.id}
                    className="event-pill calendar-cell__event"
                    title={event.title}
                    style={{ '--event-color': event.color || 'var(--color-accent)' }}
                  >
                    <span className="calendar-cell__event-text">{event.title}</span>
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
        {bars.map(({ event, week, lane, colStart, colEnd, isStart, isEnd }) => (
          <div
            key={`${event.id}-${week}`}
            className="event-pill calendar-bar"
            title={event.title}
            style={{
              gridRow: week + 2,
              gridColumn: `${colStart + 1} / ${colEnd + 2}`,
              marginTop: `calc(var(--space-xs) + 1.6rem + 2px + ${lane * (BAR_HEIGHT + BAR_GAP)}px)`,
              marginLeft: isStart ? 'var(--space-xs)' : 0,
              marginRight: isEnd ? 'var(--space-xs)' : 0,
              borderTopLeftRadius: isStart ? 15 : 0,
              borderBottomLeftRadius: isStart ? 15 : 0,
              borderTopRightRadius: isEnd ? 15 : 0,
              borderBottomRightRadius: isEnd ? 15 : 0,
              // A cut-off edge (the event continues onto the next/previous
              // week row, not its real start/end) drops its stroke entirely
              // instead of drawing a line at the screen edge — reads as
              // "flows into the next row" rather than "event ends here".
              borderLeftWidth: isStart ? 2 : 0,
              borderRightWidth: isEnd ? 2 : 0,
              // A real start's text sits at marginLeft (--space-xs) +
              // border (2px) + the bar's own 10px padding = 20px in from
              // the column edge — the same inset a per-day event pill's
              // text has (cell padding 8px + its own border 2px + pill
              // padding 10px). A cut-off left edge has neither that margin
              // nor that border, so its padding needs to make up the same
              // 18px on its own to keep both lined up.
              paddingLeft: isStart ? undefined : 'calc(var(--space-xs) + 12px)',
              '--event-color': event.color || 'var(--color-accent)',
            }}
          >
            {event.title}
          </div>
        ))}
      </div>
    </section>
  );
}
