# WallCalToDo

A wall-mounted display (old monitor + Raspberry Pi) that shows a Google
Calendar, Google Task list, and a Microsoft To Do list at the same time.
Works mounted either way — portrait puts the calendar on top with today's
agenda and the to-do list below it; landscape puts the calendar on the
left with today's agenda and to-do stacked in a column beside it. It picks
whichever automatically based on the screen's own aspect ratio, no
configuration needed.

<p align="center">
  <img src="docs/wall-photo.png" alt="WallCalToDo mounted on a wall in a custom wood frame, portrait orientation" width="360">
</p>

Below: the same display in both orientations and themes (click any of
these to see it fullscreen).

<p align="center">
  <a href="docs/demo-landscape-light.png"><img src="docs/demo-landscape-light.png" alt="Landscape orientation, light theme" width="380"></a>
  <a href="docs/demo-landscape-dark.png"><img src="docs/demo-landscape-dark.png" alt="Landscape orientation, dark theme" width="380"></a>
</p>
<p align="center">
  <a href="docs/demo-portrait-light.png"><img src="docs/demo-portrait-light.png" alt="Portrait orientation, light theme" width="220"></a>
  <a href="docs/demo-portrait-dark.png"><img src="docs/demo-portrait-dark.png" alt="Portrait orientation, dark theme" width="220"></a>
</p>

*(The four screenshots above use demo data, not a real calendar — shown
with a lot going on to demonstrate multi-day events, the "+N more"
overflow on a busy day, and a mix of completed/pending to-do items with
due dates.)*

## Why this exists

The point of this project isn't a new to-do app — it's to get a wall
calendar without giving up the one I already have. I forked this from
https://github.com/kevinclayland/WallCalToDo and am submitting pull
requests back to it.  My actual calendar and to-do list live in Android
apps: Calendar (backed by a Google/Gmail account), Tasks (backed
by a Google/Gmail account), Outlook (backed by work a Microsoft account),
and To Do (backed by work a Microsoft account). That's genuinely how I
organize my life day to day, and I didn't want a wall display that meant
switching to yet another app just so it had something to show.

So instead of inventing its own data model, WallCalToDo reads straight from
the same accounts my phone already syncs against — the Google Calendar/Task
APIs and the Microsoft Graph APIs. Anything I add, check off, or move on my
phone shows up on the wall (see "How it works" below for the polling delay),
because it's the exact same underlying data, not a copy of it. The wall
display itself is read-only, though — there's no touch input, so it's a
one-way mirror of what's on my phone/laptop/desktop, not something you edit
from.  You can probably change this if you want to make it so you can edit
from a touch screen, I don't want to due to my kiddos.


## How it works

```
Google Calendar/Task API (N accounts) ─┐
                                    ├─ poll on interval (delta/sync tokens) ─ Node backend ─┬─ WebSocket ─ React kiosk app (Chromium fullscreen, portrait)
Microsoft Graph API               ─┘                                                        └─ REST ────── React companion app (your phone, same Wi-Fi)
```

- **server/** — Node/Express backend. Handles OAuth for any number of
  Google accounts plus one Microsoft account, polls each calendar on an
  interval using delta/sync tokens (cheap, only fetches what changed),
  polls the outside temperature separately on its own longer interval,
  and pushes updates to connected displays over a WebSocket. Also exposes
  the settings API the companion app uses. Serves both built frontends
  too, so the Pi only runs one process in production.
- **frontend/** — React kiosk app that renders the calendar, today's
  agenda, and the to-do list in one screen, laid out for portrait or
  landscape automatically (see "Screen orientation" below). Base colors/
  spacing/type scale live in `frontend/src/styles/tokens.css`; the actual
  visual design (event pill styling, the calendar grid, multi-day event
  bars, etc.) is in `frontend/src/styles/base.css` and the component files
  themselves.
- **companion/** — React settings app for your phone: connect/disconnect
  Google and Microsoft accounts, toggle individual calendars/lists on or
  off, and configure theme, location, temperature units, and privacy mode.
  Reachable at `http://<pi-hostname>:3000/companion` over your home Wi-Fi —
  see "Companion app" below.
- **pi-setup/** — systemd unit for the backend + kiosk Chromium autostart,
  plus the OS-level display rotation needed for a portrait mount (see
  "Screen orientation" below — landscape needs none of that).

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

## Screen orientation

The layout adapts automatically to whichever way the screen is actually
mounted — a CSS `orientation: landscape` media query (`frontend/src/
styles/base.css`), not a setting anywhere, so it responds instantly to the
screen's real aspect ratio, including a live browser resize during
development.

- **Portrait**: calendar on top, today's agenda and the to-do list in a
  strip below it, split side by side.
- **Landscape**: calendar on the left, today's agenda and the to-do list
  stacked in a column on the right — the agenda gets more of that column's
  height than the to-do list, and the line between them is snapped to one
  of the calendar's own row lines rather than an arbitrary split.

Both use the same 19:5 proportion between the calendar and the today/to-do
area (as rows in portrait, as columns in landscape) — proportional `fr`
units throughout, not fixed pixel values, so this works at whatever
resolution your display actually is, not just the exact one it was
designed against.

Portrait needs the Pi's display output physically rotated to match how
the monitor is mounted (the *browser* just needs to think of the screen as
narrow-and-tall) — landscape needs no rotation at all, since that's a
monitor's native orientation. Rotate at the OS level, not in the browser,
only if you want portrait:

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

## Calendar legend and outside temperature

Two small widgets round out the wall display, both pinned to a bottom
corner of their panel (bottom-left/right in portrait, mirrored in
landscape):

- **Calendar legend** (bottom-left of the agenda panel) — one letter-circle
  per calendar, in its own color, so a glance at a pill tells you which
  calendar it's from. If a calendar has events with a per-event color
  override (Google Calendar's "change color of this event"), those colors
  stack behind the main circle as plain swatches. Ordered to match the
  order calendars appear in the companion app, not alphabetically.
- **Outside temperature** (bottom-right of the to-do panel) — current
  temperature plus a weather emoji, from [Open-Meteo](https://open-meteo.com/)
  (free, no API key), refreshed every 15 minutes. Switches to a moon-phase
  emoji (all 8 phases) once the sun sets, using the same sunrise/sunset
  times driving Automatic theme, and swaps in a 😷 mask instead of the
  weather icon when the local air quality is unhealthy (wildfire smoke,
  etc. — EPA US AQI ≥ 151). Needs a location set in the companion app
  (Location section) to show anything at all; Fahrenheit or Celsius is a
  toggle in that same app's Temperature section.

## Companion app

A separate small app (`companion/`) served at `/companion` lets you manage
everything from your phone or laptop, on the same Wi-Fi as the Pi:

- **API credentials** — each of the Google Calendar and Microsoft To Do
  sections has its own Client ID/Client Secret form, with a "Where do I
  get this?" panel that walks through creating your own free API
  credentials in that provider's console. No terminal/`.env` editing
  required (see the setup guide's step 7 below for screenshots) — this is
  the one thing about each provider that only needs to be entered once.
- **Add a Google account** — tapping the button starts the normal Google
  OAuth flow; you can connect as many Google accounts as you want (e.g.
  personal + work). Reconnecting an account you've already added updates
  its tokens instead of creating a duplicate.
- **Toggle calendars on/off** — each connected account lists every
  calendar Google returns for it (not just the primary one). Flipping a
  switch hides or shows that calendar's events on the wall display
  immediately — no polling delay, since filtering happens at read time
  against calendars already cached.
- **Disconnect a Google account** — removes it and its cached events
  entirely.
- **Refresh calendars** — Google doesn't notify us when you create a new
  calendar, so this button re-fetches an account's calendar list on
  demand (new calendars default to enabled).
- **Connect a Microsoft account** — same idea as Google, but only one
  account at a time. Discovers every To Do list on it (including ones
  shared with you), each with its own on/off toggle. Completed tasks are
  cleared out automatically once a week (the first poll after midnight on
  a Monday) to keep the list from accumulating crossed-off items forever —
  this only trims what the wall display shows, it never touches the real
  task in Microsoft To Do, so un-completing or editing one afterward brings
  it right back.
- **Privacy mode** — a single toggle that hides event titles (only their
  colored pills stay visible) and replaces today's agenda and the to-do
  list with a placeholder notice on the wall display, for whenever you'd
  rather not have the contents visible at a glance.
- **Location** — set once by **searching for a city** (backed by
  OpenStreetMap's free Nominatim geocoder,
  `server/src/services/geocodeService.js` — this one part does need
  internet access), shared by both Automatic theme and the outside
  temperature widget. "Use my location" is also there as a zero-typing
  shortcut when it's available, but browser geolocation needs a secure
  context, so it only shows up when the companion app is opened on the
  Pi's own screen — searching for a city works from anywhere, including
  your phone.
- **Theme** — a Light/Dark/Automatic segmented control. Automatic switches
  the wall display between light and dark at sunrise/sunset for the
  location above (computed locally, `server/src/services/sunService.js` —
  no API call needed for this part). Once a location is set, an Advanced
  toggle reveals a Sunrise row and a Sunset row that each let you shift the
  actual switch time by 15/30/45 min or 1/2/3 hours, Before or After the
  real sun event (e.g. Sunset + 30 min "After" so it doesn't go dark right
  at sunset) — the displayed time on each row is already offset-adjusted,
  i.e. the moment the switch actually happens.
- **Temperature units** — F°/C° for the outside temperature widget (see
  "Calendar legend and outside temperature" above); disabled with an
  explanatory notice until a location is set.

Every change here pushes to the wall display immediately over the same
WebSocket connection used for calendar/to-do updates — no refresh needed
on either end.

This intentionally does *not* have a login/passcode — it trusts your home
network, same as the rest of this setup. It's also **not reachable from
outside your Wi-Fi** by design; if you want to tweak settings while out of
the house, put something like Tailscale on the Pi rather than exposing it
publicly.

**Connecting a new account has to happen on the Pi's own screen**, not
from your phone — see step 7 of the setup guide below for why. Everyday
use of the companion app (toggling calendars, disconnecting an account)
works fine from your phone once accounts are already connected.

## Hardware notes

**Use a Pi 4 if you have one.** It has more RAM and a faster CPU than
older Pis, which matters because Chromium itself is the heaviest thing
running here — the Node backend is tiny by comparison (tens of MB of RAM).
A Pi 3B (1GB RAM) can run this, but with less headroom: stick to
Raspberry Pi OS Lite + a minimal kiosk compositor rather than the full
desktop if that's what you're using, and avoid heavy CSS effects
(blurs, constant animation) in the eventual design. Bandwidth and storage
are non-issues either way — this app's data is tiny JSON, not media.

One cable gotcha: the Pi 4 uses **micro-HDMI**, not full-size HDMI like
the Pi 3. Check what your monitor cable needs before you buy an adapter.

## Setup guide

Step-by-step, assuming no prior experience with any of this. It walks
through everything: flashing the SD card, installing the software,
connecting your accounts, and mounting it on the wall.

### What you'll need

- A Raspberry Pi (4 recommended — see "Hardware notes" above) with a
  power supply and a microSD card (16GB+; a card marked "A1" or "A2"
  boots noticeably faster than an unrated one)
- A monitor with an HDMI input, plus the right cable: the Pi 4 has a
  **micro-HDMI** port, older Pis have full-size HDMI
- A laptop/desktop computer, just to flash the SD card
- A Google account (for the calendar) and, if you want the to-do list, a
  Microsoft account with Tasks/To Do items
- The Pi and your phone/computer all on the same home Wi-Fi network

### 1. Flash the SD card

1. On your computer, install [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. Insert the microSD card, open Imager.
3. **Choose OS** → Raspberry Pi OS (64-bit) — the full version with a
   desktop, not "Lite". Kiosk mode needs a desktop environment to run
   Chromium in.
4. **Choose Storage** → your SD card.
5. Before writing, click the gear/settings icon (**OS customisation**) and set:
   - **Hostname** — pick something memorable, e.g. `wallcaltodo` (you'll
     use `wallcaltodo.local` to reach it later).
   - **Username/password** — this guide uses `pi` throughout; if you pick
     something else, swap it in every command below and in the two
     `pi-setup/*.service` files (they reference `/home/pi/...` and `User=pi`).
   - **Wi-Fi** — your network name and password, so it connects on first boot.
   - **Enable SSH** — with password authentication.
6. Write the image, wait for it to finish, then eject the card.

### 2. First boot

1. Put the SD card in the Pi, connect the monitor and power. Wait a
   minute or two for the first boot to finish.
2. From your computer, open a terminal and SSH in:
   ```
   ssh pi@wallcaltodo.local
   ```
   (Use the hostname you set in step 1. Accept the fingerprint prompt,
   enter the password you set.)

### 3. Update the OS and install Node.js

Run on the Pi (over the SSH session):

```
sudo apt update && sudo apt full-upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git fonts-noto-color-emoji
node -v   # should print v20.x — if it doesn't, something above failed
```

`fonts-noto-color-emoji` isn't always preinstalled on Raspberry Pi OS — without it, an emoji in an event title (from Google Calendar) shows up on the display as a blank box instead of the actual emoji. If you're seeing that on a Pi set up before this was added, just run that one `apt install` line and restart the kiosk (`sudo systemctl restart wallcaltodo` doesn't touch Chromium — reboot, or re-run `kiosk.sh`, to pick up the new font).

### 4. Get the code onto the Pi

```
git clone https://github.com/kevinclayland/WallCalToDo.git
cd WallCalToDo
cp server/.env.example server/.env
```

That's it for `.env` — it only holds things like the port and poll
interval now. Your Google/Microsoft credentials get entered through the
companion app itself in step 7 below, not by hand-editing a file.

### 5. Install dependencies and build both apps

```
cd ~/WallCalToDo/server && npm install
cd ~/WallCalToDo/frontend && npm install && npm run build
cd ~/WallCalToDo/companion && npm install && npm run build
```

This takes a few minutes on a Pi — that's normal.

### 6. Run the backend as a background service

```
sudo cp ~/WallCalToDo/pi-setup/wallcaltodo.service /etc/systemd/system/
sudo systemctl enable --now wallcaltodo
sudo systemctl status wallcaltodo
```

The status output should say **active (running)**. If it doesn't, run
`sudo journalctl -u wallcaltodo -n 50` to see why.

### 7. Connect your accounts

Do this step on the Pi's own screen (i.e. with a keyboard/mouse on the
monitor connected to the Pi, in its normal desktop — not kiosk mode yet,
and not from your phone). This is required because the redirect URLs each
provider needs are `localhost`-only, which only means something to a
browser running on the Pi itself.

1. Open the Pi's Chromium (Menu → Internet → Chromium) and go to:
   ```
   http://localhost:3000/companion
   ```
2. Scroll to **Google Calendar**. Click **Where do I get this?** to
   expand the steps for creating your own free Google API credentials —
   it walks you through the Google Cloud Console and tells you exactly
   what to paste in:

   ![Google Calendar section of the companion app, showing the expanded "Where do I get this?" steps and the Client ID/Client Secret fields](docs/setup-google-credentials.png)

   Paste the **Client ID** and **Client Secret** it gives you into the two
   fields and click **Save**.
3. The section now shows **Configured**, and a **+ Add Google account**
   button appears. Tap it, sign in, grant access. Repeat for every Google
   account you want on the display. Each connected account shows its
   calendars with a toggle for each one:

   ![A connected Google account in the companion app, showing its calendar list with per-calendar toggles](docs/setup-google-connected.png)

4. Scroll to **Microsoft To Do Reminders** and do the same thing — expand
   **Where do I get this?**, follow the Azure Portal steps, paste in the
   Client ID/Secret it gives you, Save:

   ![Microsoft To Do Reminders section of the companion app, showing the expanded "Where do I get this?" steps and the Client ID/Client Secret fields](docs/setup-microsoft-credentials.png)

5. Tap **+ Connect Microsoft account** and sign in.

If anything about a connection attempt fails (wrong secret, an account
that isn't added as a Google test user yet, etc.), the companion app shows
the reason in a banner at the top of the page instead of a blank/broken
screen — fix whatever it says and try again.

Then check `http://localhost:3000` in that same browser — you should see
your real events/tasks. If it's empty, give it a minute (it polls every
60 seconds by default) and check `sudo journalctl -u wallcaltodo -f`.

<sub>Prefer editing a file over a web form? `server/.env` still accepts
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`MS_CLIENT_ID`/`MS_CLIENT_SECRET`
as a fallback — whatever's saved through the companion app just takes
priority over them.</sub>

### 8. Enable kiosk mode (and rotate the display, if mounting in portrait)

Follow **`pi-setup/kiosk/README.md`** — it covers setting Chromium to
auto-launch full-screen on boot, plus rotating the display if you're
mounting in portrait (skip that part for landscape — see "Screen
orientation" above), depending on your Pi OS version.

Then reboot:

```
sudo reboot
```

The Pi should come back up straight into the full-screen display.

### 9. Mount it

Physically attach the monitor to the Pi and mount both on the wall.
You're done — from here on, changes to your calendars show up
automatically (see "Auto-update behavior" above).

### Managing it later

From your phone, on the same Wi-Fi, open
`http://wallcaltodo.local:3000/companion` (swap in your own hostname) to
toggle calendars or disconnect an account — this works fine from your
phone. **Adding a brand-new account** still has to be done on the Pi's own
screen, same as step 7 (or via an SSH tunnel — `ssh -L 3000:localhost:3000 pi@wallcaltodo.local`,
then open `http://localhost:3000/companion` on your laptop through the
tunnel — if you'd rather not walk over to the Pi).

### Troubleshooting

- **Can't reach `wallcaltodo.local` from your phone** — not every network/
  device supports `.local` mDNS names. Find the Pi's IP instead: SSH in
  and run `hostname -I`, then use `http://<that-ip>:3000/companion`.
- **Backend won't start** — `sudo systemctl status wallcaltodo` and
  `sudo journalctl -u wallcaltodo -n 50` for the actual error.
- **Google/Microsoft connect fails** — the companion app shows the reason
  in a banner at the top of the page (wrong Client Secret, an account not
  added as a Google test user yet, etc.) rather than leaving you guessing.
- **Kiosk screen is blank or shows a desktop instead of the app** — SSH in
  and run `pi-setup/kiosk/kiosk.sh` by hand to see its output directly,
  and double check the autostart file syntax in `pi-setup/kiosk/README.md`.
- **You used a different username than `pi`** — update `User=` and the
  `/home/pi/...` paths in `pi-setup/wallcaltodo.service` before copying it
  to `/etc/systemd/system/`.

## Local development

For iterating on the code itself (not installing on the Pi), run each
piece on your own computer instead:

```
cd server && npm install && npm run dev
cd frontend && npm install && npm run dev
cd companion && npm install && npm run dev
```

The kiosk app lands on `http://localhost:5173`, the companion app on
whatever port Vite picks next (check its terminal output) — both proxy
`/api` and `/auth` calls to the backend on `:3000` (the kiosk app also
proxies `/ws`, since it's the one that needs the live WebSocket push; the
companion app doesn't use it). Since everything's on `localhost` here, the
OAuth connect step just works directly: open the companion app, enter your
Google/Microsoft API credentials in their respective sections (see step 7
of the setup guide above if you haven't created those yet), then use
**+ Add Google account** / **+ Connect Microsoft account**.

To preview the kiosk's portrait layout on a normal monitor, just shrink
the browser window narrow (taller than it is wide) — no special flag
needed. Widen it back out (wider than tall) to preview landscape instead.

## Design

The visual design lives directly in this repo now — `frontend/src/styles/
tokens.css` for the base color/spacing/type scale, `frontend/src/styles/
base.css` and the component files (`CalendarView.jsx`, `CalendarHeader.jsx`,
`DayAgenda.jsx`, `TodoView.jsx`, `Legend.jsx`, `WeatherWidget.jsx`) for the
actual layout and styling. It's been iterated on in place rather than
built separately and dropped in: the calendar grid, event pill styling (a
stroke in the event's own color over a tinted background, not a solid
fill), multi-day event bars, the portrait/landscape split (proportional
`fr` units throughout, not fixed pixels, so it isn't tied to one specific
resolution), and a light/dark theme (`tokens.css` defines both palettes
behind a `data-theme` attribute App.jsx sets on `<html>`, driven by the
companion app's theme setting) were all designed and shipped this way. The
data layer (OAuth, polling, WebSocket push) is unaffected by any of it —
styling changes stay confined to the style files and component markup.

## Roadmap

**Multiple account providers per side** — right now the calendar side is
Google-only and the to-do side is Microsoft-only. Supporting more than one
provider on each side (so the calendar side isn't locked to Google, and
the to-do side isn't locked to Microsoft) is planned for a future release.
