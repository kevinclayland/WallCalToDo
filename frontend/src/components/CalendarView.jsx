import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WEEKDAYS, addDays, buildMonthGrid, dateKey, parseLocalDate, sortDayEvents } from '../utils/date.js';

// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, start, end, allDay, location, calendarLabel, color }]

const BAR_HEIGHT = 28;
const BAR_GAP = 4;
// Matches .calendar-cell__events' own `gap` in base.css — DayCell's fit
// calculation below needs the same number to sum real rendered pill
// heights correctly.
const EVENT_GAP = 4;
// Not a real cap on how many can be *shown* (DayCell measures that per
// cell, against the real rendered height, so it's correct on any screen
// size and for any month length) — just a defensive ceiling on how many
// get rendered at all, for the pathological case of a day with dozens of
// events.
const MEASURE_CAP = 12;

// One calendar day cell. Renders every one of today's events up front and
// measures, via ref, how many actually fit in the real available height
// (the cell's own — which depends on the screen's actual size and how
// many week rows this month has, neither knowable ahead of time) before
// the browser paints, then re-renders trimmed to that count — so "+N more"
// only ever appears when N events truly don't fit, not because of a flat
// guessed limit. Re-measures whenever this day's event list changes; a
// month change also naturally re-measures every cell, since each one is
// keyed by date and get a fresh mount with the new month's row heights.
function DayCell({ date, inMonth, isToday, dayEvents, barsSpace, gridRow, gridColumn, privacyMode }) {
  const cappedEvents = dayEvents.slice(0, MEASURE_CAP);
  const listRef = useRef(null);
  // Starts optimistic (all of them) — the effect below measures and trims
  // this before the browser ever paints, so there's no flash of
  // too-many-events. CalendarView gives this component a key that includes
  // this day's event IDs and its barsSpace (see the cells.map() below), so
  // whenever either changes this remounts — a clean fresh mount is what
  // resets this back to "show everything" so the effect can measure
  // against the complete set again, rather than only ever re-checking
  // whatever a previous measurement already trimmed down to.
  const [visibleCount, setVisibleCount] = useState(cappedEvents.length);

  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;

    function fitCount(available) {
      let used = 0;
      let count = 0;
      for (const child of ul.children) {
        const height = child.getBoundingClientRect().height;
        const next = used + height + (count > 0 ? EVENT_GAP : 0);
        if (next > available) break;
        used = next;
        count++;
      }
      return count;
    }

    let count = fitCount(ul.clientHeight);

    if (count < cappedEvents.length) {
      // Everything didn't fit, so a "+N more" badge is about to appear —
      // but it's a sibling of this list in the same flex column
      // (.calendar-cell), so it eats into the list's own share of the
      // cell's height once it's there. The count above was measured
      // against the taller "no badge yet" height, which can overstate
      // what actually fits (e.g. a 3rd pill "fits" the full cell but
      // not the cell-minus-badge). Insert a real (invisible) badge and
      // re-measure against the space it actually leaves, rather than
      // guess its height — cheap, and exactly right for any theme/font.
      const cell = ul.parentElement;
      const probe = document.createElement('span');
      probe.className = 'calendar-cell__more';
      probe.textContent = '+1 more';
      probe.style.visibility = 'hidden';
      cell.appendChild(probe);
      count = fitCount(ul.clientHeight);
      cell.removeChild(probe);
    }

    setVisibleCount(count);
    // Runs once per mount, which is exactly when a (re-)measure is needed
    // — see the key comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleEvents = cappedEvents.slice(0, visibleCount);
  const hiddenCount = dayEvents.length - visibleEvents.length;

  return (
    <div
      className={['calendar-cell', inMonth ? '' : 'calendar-cell--outside', isToday ? 'calendar-cell--today' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ gridRow, gridColumn }}
    >
      <span className="calendar-cell__day">{date.getDate()}</span>
      <ul className="calendar-cell__events" ref={listRef} style={barsSpace > 0 ? { marginTop: barsSpace } : undefined}>
        {visibleEvents.map((event) => (
          <li
            key={event.id}
            className="event-pill calendar-cell__event"
            title={privacyMode ? undefined : event.title}
            style={{ '--event-color': event.color || 'var(--color-accent)' }}
          >
            {/* Privacy mode: keep the colored pill itself (that's the
                point — at a glance there's still "something at 2pm"),
                just never render the title text/tooltip that would
                say what it is. */}
            {!privacyMode && <span className="calendar-cell__event-text">{event.title}</span>}
          </li>
        ))}
      </ul>
      {/* Pinned outside the (overflow-clipped) events list so it's always
          fully visible — if space is tight, an event's text gets clipped
          before this ever would. */}
      {hiddenCount > 0 && <span className="calendar-cell__more">+{hiddenCount} more</span>}
    </div>
  );
}

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

export default function CalendarView({ events, privacyMode, onMeasureSplit }) {
  const [now, setNow] = useState(() => new Date());
  const sectionRef = useRef(null);
  const weekRowRefs = useRef({});

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = dateKey(now);
  const cells = buildMonthGrid(now.getFullYear(), now.getMonth());
  const weekCount = cells.length / 7;

  // Landscape layout (see App.jsx/base.css) puts today's agenda and the
  // to-do list in a column beside the calendar instead of below it, and
  // the line between those two should land on one of the calendar's own
  // row lines rather than an arbitrary split -- specifically the first
  // one past the halfway point of the shared height. Row height isn't a
  // fixed number (a 4-week February and a 6-week month divide the same
  // space differently — see the calendar-grid's own gridTemplateRows
  // below), so this measures the real rendered rows via a ref per week
  // (weekRowRefs) instead of computing it by hand. Only the boundary
  // *positions* matter here, not their content, so this re-measures on
  // weekCount changing (a new month) and on window resize (this display
  // doesn't need to handle being rotated live, but the layout does need
  // to stay correct if the browser window itself is resized) — not on
  // `events` changing, since every week row is the same height (`1fr`)
  // regardless of what's in it.
  useLayoutEffect(() => {
    if (!onMeasureSplit) return;
    function measure() {
      const section = sectionRef.current;
      if (!section) return;
      const sectionRect = section.getBoundingClientRect();
      const halfway = sectionRect.height / 2;
      let chosen = null;
      for (let week = 0; week < weekCount; week++) {
        const marker = weekRowRefs.current[week];
        if (!marker) continue;
        const bottom = marker.getBoundingClientRect().bottom - sectionRect.top;
        if (bottom > halfway) {
          chosen = bottom;
          break;
        }
      }
      onMeasureSplit(chosen);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [weekCount, onMeasureSplit]);

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
  // starts), so overlapping date ranges stack instead of colliding.
  // laneCountByCell tracks how many lanes are actually occupied at each
  // individual day, not the week's max — a day with no bar over it (even
  // if some other day in the same week has one) reserves no space at
  // all, instead of every day in the row reserving the row's busiest
  // day's worth of space for bars that were never above it.
  const bars = [];
  const laneCountByCell = Array.from({ length: weekCount }, () => new Array(7).fill(0));
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
      for (let col = colStart; col <= colEnd; col++) {
        laneCountByCell[week][col] = Math.max(laneCountByCell[week][col], lane + 1);
      }
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
    <section className="calendar-section" ref={sectionRef}>
      <div className="calendar-grid" style={{ gridTemplateRows: `auto repeat(${weekCount}, minmax(0, 1fr))` }}>
        {WEEKDAYS.map((day, i) => (
          <div key={day} className="calendar-grid__weekday" style={{ gridRow: 1, gridColumn: i + 1 }}>
            {day}
          </div>
        ))}
        {/* Invisible, zero-content markers — one per week row, column 1
            only (a boundary's vertical position is the same across every
            column in its row, so there's no need to span all 7) — purely
            so the effect above has something real to measure via
            getBoundingClientRect(), rather than re-deriving row heights
            by hand from gap/border/padding values that'd need updating
            here too if any of them ever changed. */}
        {Array.from({ length: weekCount }, (_, week) => (
          <div
            key={`row-marker-${week}`}
            ref={(el) => {
              if (el) weekRowRefs.current[week] = el;
            }}
            aria-hidden="true"
            style={{ gridRow: week + 2, gridColumn: 1, pointerEvents: 'none' }}
          />
        ))}
        {cells.map(({ date, inMonth }, i) => {
          const key = dateKey(date);
          const week = Math.floor(i / 7);
          const dayEvents = sortDayEvents(singleDayEventsByKey[key] || []);
          const barsSpace = laneCountByCell[week][i % 7] * (BAR_HEIGHT + BAR_GAP);
          return (
            <DayCell
              // Content-aware, not just the date: this day's own event IDs
              // plus the bar space above it (from other days' multi-day
              // events sharing this week) are exactly the two things that
              // affect how many events fit, so either changing should
              // force a fresh mount and re-measure — see DayCell's comment.
              key={`${key}:${dayEvents.map((event) => event.id).join(',')}:${barsSpace}`}
              date={date}
              inMonth={inMonth}
              isToday={key === todayKey}
              dayEvents={dayEvents}
              barsSpace={barsSpace}
              gridRow={week + 2}
              gridColumn={(i % 7) + 1}
              privacyMode={privacyMode}
            />
          );
        })}
        {bars.map(({ event, week, lane, colStart, colEnd, isStart, isEnd }) => (
          <div
            key={`${event.id}-${week}`}
            className="event-pill calendar-bar"
            title={privacyMode ? undefined : event.title}
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
            {!privacyMode && event.title}
          </div>
        ))}
      </div>
    </section>
  );
}
