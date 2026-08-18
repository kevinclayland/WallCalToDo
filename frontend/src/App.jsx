import { useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket.js';
import CalendarView from './components/CalendarView.jsx';
import TodoView from './components/TodoView.jsx';
import StatusBar from './components/StatusBar.jsx';

export default function App() {
  const { calendar, todo, view, connected } = useWebSocket();

  useEffect(() => {
    // Dev convenience: press "v" to flip views without wiring up the
    // physical button yet. This hits the same endpoint the button does
    // (POST /api/view/toggle), which broadcasts the new view to every
    // connected display over the WebSocket — including this one.
    function handleKey(event) {
      if (event.key === 'v') fetch('/api/view/toggle', { method: 'POST' });
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="app">
      {view === 'calendar' ? <CalendarView events={calendar} /> : <TodoView tasks={todo} />}
      <StatusBar connected={connected} view={view} />
    </div>
  );
}
