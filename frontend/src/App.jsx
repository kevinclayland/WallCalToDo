import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket.js';
import CalendarView from './components/CalendarView.jsx';
import DayAgenda from './components/DayAgenda.jsx';
import TodoView from './components/TodoView.jsx';

// 'light'/'dark' settings are direct; 'auto' switches at sunrise/sunset for
// the location saved in the companion app. Falls back to 'dark' (this
// project's original, only-ever-shipped look) if settings haven't loaded
// yet or auto mode has no location/sun-times to go on.
function effectiveTheme(settings, now) {
  if (!settings) return 'dark';
  if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
  if (!settings.sunrise || !settings.sunset) return 'dark';
  const sunrise = new Date(settings.sunrise);
  const sunset = new Date(settings.sunset);
  return now >= sunrise && now < sunset ? 'light' : 'dark';
}

export default function App() {
  const { calendar, todo, settings, connected } = useWebSocket();

  // Its own clock, same pattern as CalendarView/DayAgenda: this only needs
  // to catch the sunrise/sunset boundary passing, not tick every second, so
  // once a minute is plenty.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme(settings, now);
  }, [settings, now]);

  const privacyMode = Boolean(settings?.privacyMode);

  return (
    <div className="app">
      <CalendarView events={calendar} connected={connected} privacyMode={privacyMode} />
      <div className="bottom">
        <DayAgenda events={calendar} privacyMode={privacyMode} />
        <TodoView tasks={todo} privacyMode={privacyMode} />
      </div>
    </div>
  );
}
