// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, completed, due, importance }]
//
// Checkboxes are purely a visual read/not-read indicator of each item's
// real completion state — there's no touch input on this display to
// toggle them.
export default function TodoView({ tasks, privacyMode }) {
  return (
    <section className="todo">
      <h2 className="todo__heading">To Do</h2>
      {privacyMode ? (
        <p className="view__empty">Privacy mode activated</p>
      ) : tasks.length === 0 ? (
        <p className="view__empty">Nothing on the list.</p>
      ) : (
        <ul className="todo-list">
          {tasks.map((task) => (
            <li key={task.id} className={`todo-list__item${task.completed ? ' is-completed' : ''}`}>
              <span className="todo-list__checkbox" aria-hidden="true">
                {task.completed ? (
                  <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M16 0C17.1046 0 18 0.895431 18 2V16C18 17.1046 17.1046 18 16 18H2C0.895431 18 8.05332e-09 17.1046 0 16V2C0 0.895431 0.895431 8.05319e-09 2 0H16ZM7 9.89258L4.40039 7.29297L2.29297 9.40039L7 14.1074L15.707 5.40039L13.5996 3.29297L7 9.89258Z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
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
