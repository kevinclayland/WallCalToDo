import { useEffect, useRef, useState } from 'react';

const RECONNECT_DELAY_MS = 2000;

// Single long-lived connection for the whole app: the server pushes
// calendar/todo updates the moment it detects them (see
// server/src/services/poller.js), so the display never has to poll or be
// manually refreshed. Auto-reconnects with a fixed delay if the connection
// drops (Pi Wi-Fi hiccup, backend restart, etc.).
export function useWebSocket() {
  const [calendar, setCalendar] = useState([]);
  const [todo, setTodo] = useState([]);
  const [settings, setSettings] = useState(null);
  const [weather, setWeather] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer = null;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'calendar') setCalendar(message.data);
        else if (message.type === 'todo') setTodo(message.data);
        else if (message.type === 'settings') setSettings(message.data);
        else if (message.type === 'weather') setWeather(message.data);
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  return { calendar, todo, settings, weather, connected };
}
