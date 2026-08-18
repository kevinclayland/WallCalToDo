// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, start, end, allDay, location }]
export default function CalendarView({ events }) {
  return (
    <section className="view view--calendar">
      <h1 className="view__title">Calendar</h1>
      {events.length === 0 ? (
        <p className="view__empty">No upcoming events.</p>
      ) : (
        <ul className="event-list">
          {events.map((event) => (
            <li key={event.id} className="event-list__item">
              <span className="event-list__time">
                {event.allDay ? 'All day' : new Date(event.start).toLocaleString()}
              </span>
              <span className="event-list__title">{event.title}</span>
              {event.location && <span className="event-list__location">{event.location}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
