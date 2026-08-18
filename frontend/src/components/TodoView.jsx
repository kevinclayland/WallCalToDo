// Placeholder presentation only — swap this markup/styling for the real
// design later. Data shape stays the same: [{ id, title, completed, due, importance }]
export default function TodoView({ tasks }) {
  return (
    <section className="view view--todo">
      <h1 className="view__title">To Do</h1>
      {tasks.length === 0 ? (
        <p className="view__empty">Nothing on the list.</p>
      ) : (
        <ul className="todo-list">
          {tasks.map((task) => (
            <li key={task.id} className={`todo-list__item${task.completed ? ' is-completed' : ''}`}>
              <span className="todo-list__title">{task.title}</span>
              {task.due && <span className="todo-list__due">{new Date(task.due).toLocaleDateString()}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
