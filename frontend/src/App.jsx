import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket.js';
import CalendarHeader from './components/CalendarHeader.jsx';
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
  const { calendar, todo, settings, weather, connected } = useWebSocket();

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

  // Landscape only (see .secondary in base.css -- ignored by portrait's
  // own column split) -- the exact pixel height CalendarView measured for
  // today's agenda, so the line between it and the to-do list lands on
  // one of the calendar's own row lines instead of an arbitrary split.
  // null until the first measurement lands (effectively instant --
  // CalendarView measures in useLayoutEffect, before paint) or if it's
  // ever unmeasurable, in which case .secondary's own CSS fallback covers it.
  const [todayHeight, setTodayHeight] = useState(null);

  return (
    <div className="app">
      <CalendarHeader connected={connected} />
      <div className="body">
        <CalendarView events={calendar} privacyMode={privacyMode} onMeasureSplit={setTodayHeight} />
        <div className="secondary" style={{ '--today-height': todayHeight ? `${todayHeight}px` : undefined }}>
          <DayAgenda events={calendar} privacyMode={privacyMode} />
          <TodoView tasks={todo} privacyMode={privacyMode} weather={weather} settings={settings} />
        </div>
      </div>
    </div>
  );
}
