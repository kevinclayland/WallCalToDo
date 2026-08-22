import { useWebSocket } from './hooks/useWebSocket.js';
import CalendarView from './components/CalendarView.jsx';
import DayAgenda from './components/DayAgenda.jsx';
import TodoView from './components/TodoView.jsx';

export default function App() {
  const { calendar, todo, connected } = useWebSocket();

  return (
    <div className="app">
      <CalendarView events={calendar} connected={connected} />
      <div className="bottom">
        <DayAgenda events={calendar} />
        <TodoView tasks={todo} />
      </div>
    </div>
  );
}
