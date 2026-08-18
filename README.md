# WallCalToDo

A wall-mounted display (old monitor, portrait orientation, + Raspberry Pi)
that shows a Google Calendar and a Microsoft To Do list at the same time —
calendar on top, to-do list on the bottom.

## How it works

```
Google Calendar API  ─┐
                       ├─ poll on interval (delta/sync tokens) ─ Node backend ─ WebSocket ─ React kiosk app (Chromium fullscreen, portrait)
Microsoft Graph API  ─┘
```

- **server/** — Node/Express backend. Handles OAuth for both accounts,
  polls each API on an interval using delta/sync tokens (cheap, only
  fetches what changed), and pushes updates to connected displays over a
  WebSocket. Serves the built frontend too, so the Pi only runs one
  process in production.
- **frontend/** — React app that renders both views stacked in a single
  screen (calendar top, to-do bottom). All colors/spacing/type come from
  `frontend/src/styles/tokens.css` so the real design can drop in later
  without touching component logic.
- **pi-setup/** — systemd unit for the backend + kiosk Chromium autostart
  (configured for a portrait-rotated display).

## Auto-update behavior

There's no manual refresh step. The backend polls Google Calendar and
Microsoft To Do every `POLL_INTERVAL_MS` (default 60s, see `server/.env`)
using **sync tokens** (Google) and **delta queries** (Microsoft) — each
poll asks "what changed since last time?" rather than re-downloading
everything, so it's cheap enough to poll frequently if you want faster
updates (e.g. drop it to 15–20s).

When a poll detects a change, the backend immediately pushes the new data
to every connected display over its WebSocket connection
(`server/src/ws/hub.js`) — so adding an event or a to-do item shows up on
the wall within one poll interval, with no page reload. A newly connecting
or reconnecting display (e.g. after a reboot) gets the full current state
the instant it connects.

True instant push (Google/Microsoft calling *us* the moment something
changes) would need a webhook subscription reachable from the internet,
which means a public HTTPS endpoint — not practical for a Pi sitting
behind home NAT. Polling with delta/sync tokens gets you effectively the
same result (updates within seconds to a minute) without that
infrastructure.

## Portrait orientation

The layout (`frontend/src/styles/base.css`) is a simple CSS grid: calendar
takes the top ~55% of the screen, the to-do list the bottom ~45%, with a
divider between them. This works regardless of the monitor's physical
rotation — the *browser* just needs to think of the screen as portrait
(narrow width, tall height), which means the Pi's display output itself
needs to be rotated to match how the monitor is physically mounted.

Rotate the display at the OS level, not in the browser:

- **Bookworm (Wayland/labwc)**: `wlr-randr --output <output> --transform 90`
  (use `270` if 90 comes out upside down for your mount), run once to test,
  then add it to `~/.config/labwc/autostart` above the kiosk launch line.
  `wlr-randr` lists your output name.
- **Bullseye and earlier (X11)**: add `xrandr --output <output> --rotate left`
  (or `right`) to the autostart script before Chromium launches. `xrandr`
  (no args) lists your output name.

If the monitor is on an HDMI-to-something adapter that doesn't like
software rotation, some HDMI/DSI displays also support rotation via
`/boot/firmware/config.txt` (`display_rotate` or `video=` framebuffer
params) — check your specific display's docs if `wlr-randr`/`xrandr`
doesn't take effect.

## Getting started

### 1. Credentials

- **Google**: Cloud Console → APIs & Services → Credentials → OAuth client
  ID (Web application). Add `http://localhost:3000/auth/google/callback`
  as an authorized redirect URI. Enable the Google Calendar API.
- **Microsoft**: Azure Portal → App registrations → New registration. Add
  `http://localhost:3000/auth/microsoft/callback` as a Web redirect URI,
  and grant the `Tasks.Read` delegated permission under API permissions.

Copy `server/.env.example` to `server/.env` and fill in both sets of
credentials.

### 2. Run it

```
cd server && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173` (Vite dev server, proxies API/WS calls to the
backend on :3000). To preview the portrait layout on a normal monitor,
just shrink the browser window narrow — no special dev flag needed.

Visit `http://localhost:3000/auth/google` and
`http://localhost:3000/auth/microsoft` once each to connect the two
accounts — do this from a laptop/phone on the same network, not something
the kiosk display itself needs to do.

### 3. Deploy to the Pi

```
cd frontend && npm run build       # outputs frontend/dist, served by the backend
```

Copy the repo to the Pi (or `git clone` it there), `npm install --omit=dev`
in `server/`, put a real `.env` in `server/`, then:

```
sudo cp pi-setup/wallcaltodo.service /etc/systemd/system/
sudo systemctl enable --now wallcaltodo
```

Then follow `pi-setup/kiosk/README.md` to rotate the display and autostart
Chromium in kiosk mode.

## Design

This repo intentionally ships with placeholder UI only
(`frontend/src/styles/tokens.css` + minimal component markup) — the real
visual design is being done separately as a portfolio piece. Swapping in
the final design should only mean editing `tokens.css` and the component
markup/styles; the data layer (OAuth, polling, WebSocket push) doesn't
need to change.
