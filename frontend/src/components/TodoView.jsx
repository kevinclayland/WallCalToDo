// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, completed, due, importance }]
//
// Checkboxes are purely a visual read/not-read indicator of each item's
// real completion state — there's no touch input on this display to
// toggle them.
export default function TodoView({ tasks }) {
  return (
    <section className="todo">
      <h2 className="todo__heading">To Do</h2>
      {tasks.length === 0 ? (
        <p className="view__empty">Nothing on the list.</p>
      ) : (
        <ul className="todo-list">
          {tasks.map((task) => (
            <li key={task.id} className={`todo-list__item${task.completed ? ' is-completed' : ''}`}>
              <span className="todo-list__checkbox" aria-hidden="true">
                {task.completed ? '✓' : ''}
              </span>
              <span className="todo-list__title">{task.title}</span>
              {task.due && <span className="todo-list__due">{new Date(task.due).toLocaleDateString('en-US')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
