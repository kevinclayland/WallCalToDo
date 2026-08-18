import { useWebSocket } from './hooks/useWebSocket.js';
import CalendarView from './components/CalendarView.jsx';
import TodoView from './components/TodoView.jsx';
import StatusBar from './components/StatusBar.jsx';

export default function App() {
  const { calendar, todo, connected } = useWebSocket();

  return (
    <div className="app">
      <CalendarView events={calendar} />
      <TodoView tasks={todo} />
      <StatusBar connected={connected} />
    </div>
  );
}
