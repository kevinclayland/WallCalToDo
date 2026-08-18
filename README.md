# WallCalToDo

A wall-mounted display (old monitor, portrait orientation, + Raspberry Pi)
that shows a Google Calendar and a Microsoft To Do list at the same time —
calendar on top, to-do list on the bottom.

## How it works

```
Google Calendar API (N accounts) ─┐
                                    ├─ poll on interval (delta/sync tokens) ─ Node backend ─┬─ WebSocket ─ React kiosk app (Chromium fullscreen, portrait)
Microsoft Graph API               ─┘                                                        └─ REST ────── React companion app (your phone, same Wi-Fi)
```

- **server/** — Node/Express backend. Handles OAuth for any number of
  Google accounts plus one Microsoft account, polls each calendar on an
  interval using delta/sync tokens (cheap, only fetches what changed), and
  pushes updates to connected displays over a WebSocket. Also exposes the
  settings API the companion app uses. Serves both built frontends too, so
  the Pi only runs one process in production.
- **frontend/** — React kiosk app that renders both views stacked in a
  single screen (calendar top, to-do bottom). All colors/spacing/type come
  from `frontend/src/styles/tokens.css` so the real design can drop in
  later without touching component logic.
- **companion/** — React settings app for your phone: connect/disconnect
  Google accounts and toggle individual calendars on or off. Reachable at
  `http://<pi-hostname>:3000/companion` over your home Wi-Fi — see
  "Companion app" below.
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

## Companion app

A separate small app (`companion/`) served at `/companion` lets you manage
the calendar side from your phone or laptop, on the same Wi-Fi as the Pi:

- **Add a Google account** — tapping the button starts the normal Google
  OAuth flow; you can connect as many Google accounts as you want (e.g.
  personal + work). Reconnecting an account you've already added updates
  its tokens instead of creating a duplicate.
- **Toggle calendars on/off** — each connected account lists every
  calendar Google returns for it (not just the primary one). Flipping a
  switch hides or shows that calendar's events on the wall display
  immediately — no polling delay, since filtering happens at read time
  against calendars already cached.
- **Disconnect an account** — removes it and its cached events entirely.
- **Refresh calendars** — Google doesn't notify us when you create a new
  calendar, so this button re-fetches an account's calendar list on
  demand (new calendars default to enabled).

This intentionally does *not* have a login/passcode — it trusts your home
network, same as the rest of this setup. It's also **not reachable from
outside your Wi-Fi** by design; if you want to tweak settings while out of
the house, put something like Tailscale on the Pi rather than exposing it
publicly.

There's deliberately no theme switching here yet — that's waiting on the
real visual design (see "Design" below).

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
cd companion && npm install && npm run dev
```

The kiosk app is on `http://localhost:5173`, the companion app on whatever
port Vite picks next (check its terminal output) — both proxy API/WS calls
to the backend on :3000. To preview the kiosk's portrait layout on a normal
monitor, just shrink the browser window narrow.

Open the companion app and use its "Add Google account" button (or visit
`http://localhost:3000/auth/google` directly) to connect one or more
Google accounts. Visit `http://localhost:3000/auth/microsoft` once to
connect Microsoft To Do. Do this from a laptop/phone on the same network —
not something the kiosk display itself needs to do.

### 3. Deploy to the Pi

```
cd frontend && npm run build       # outputs frontend/dist, served by the backend
cd companion && npm run build      # outputs companion/dist, served by the backend at /companion
```

Copy the repo to the Pi (or `git clone` it there), `npm install --omit=dev`
in `server/`, put a real `.env` in `server/`, then:

```
sudo cp pi-setup/wallcaltodo.service /etc/systemd/system/
sudo systemctl enable --now wallcaltodo
```

Then follow `pi-setup/kiosk/README.md` to rotate the display and autostart
Chromium in kiosk mode.

From your phone, on the same Wi-Fi, open `http://<pi-hostname>.local:3000/companion`
(Raspberry Pi OS runs mDNS by default, so the `.local` hostname — e.g.
`raspberrypi.local` — resolves without needing to know the Pi's IP).

## Design

This repo intentionally ships with placeholder UI only
(`frontend/src/styles/tokens.css` + minimal component markup) — the real
visual design is being done separately as a portfolio piece. Swapping in
the final design should only mean editing `tokens.css` and the component
markup/styles; the data layer (OAuth, polling, WebSocket push) doesn't
need to change.
