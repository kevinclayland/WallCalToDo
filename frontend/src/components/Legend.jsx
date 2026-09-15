// Explains what each calendar's color means, plus any per-event color
// overrides actually in use within it (Google Calendar's "change color of
// this event" option) -- one letter-circle per calendar (its own default
// color, labeled with the calendar's first letter), with any override
// colors seen among its events stacked behind it as plain color swatches,
// each peeking out STACK_OFFSET above the one in front of it.
const CIRCLE_SIZE = 28;
const STACK_OFFSET = 7;

// One entry per distinct calendarLabel seen in `events`. event.calendarColor
// is the calendar's own (never-overridden) color; events cached from before
// that field existed fall back to their own color, which is correct for the
// common case (no override) and self-corrects once the daily full resync
// refreshes them. Any other distinct color actually used within that same
// calendar becomes a secondary/override swatch, sorted for a stable order
// across renders instead of whatever order events happen to be in.
function buildGroups(events) {
  const byLabel = new Map();
  for (const event of events) {
    const mainColor = event.calendarColor || event.color;
    if (!mainColor) continue;
    if (!byLabel.has(event.calendarLabel)) {
      byLabel.set(event.calendarLabel, { mainColor, secondary: new Set() });
    }
    const group = byLabel.get(event.calendarLabel);
    if (event.color && event.color !== group.mainColor) group.secondary.add(event.color);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { mainColor, secondary }]) => ({
      label,
      mainColor,
      secondaryColors: [...secondary].sort(),
    }));
}

export default function Legend({ events }) {
  const groups = buildGroups(events);
  if (groups.length === 0) return null;

  return (
    <div className="legend">
      {groups.map((group) => (
        <div
          key={group.label}
          className="legend__group"
          style={{ height: CIRCLE_SIZE + STACK_OFFSET * group.secondaryColors.length }}
        >
          {group.secondaryColors.map((color, i) => (
            <span
              key={color}
              className="event-pill legend__circle"
              style={{ '--event-color': color, bottom: (i + 1) * STACK_OFFSET }}
            />
          ))}
          <span className="event-pill legend__circle legend__circle--main" style={{ '--event-color': group.mainColor }}>
            {group.label.charAt(0).toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}
