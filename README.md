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

**Connecting a new account has to happen on the Pi's own screen**, not
from your phone — see step 8 of the setup guide below for why. Everyday
use of the companion app (toggling calendars, disconnecting an account)
works fine from your phone once accounts are already connected.

There's deliberately no theme switching here yet — that's waiting on the
real visual design (see "Design" below).

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

### 4. Create your OAuth credentials

This is the fiddliest part, but it's a one-time setup in each provider's
developer console.

**Google:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (top-left project switcher → New Project).
2. **APIs & Services → Library**, search "Google Calendar API", click **Enable**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill in an app name and your email, save. Under **Test users**, add every Google account you plan to connect (the app stays unpublished/personal-use, so only listed test users can sign in).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**. Application type: **Web application**. Under **Authorized redirect URIs**, add exactly:
   ```
   http://localhost:3000/auth/google/callback
   ```
   (It has to be `localhost`, not the Pi's hostname/IP — Google only allows plain `http://` for the literal loopback address. This is why account-connecting happens on the Pi's own screen in step 8, not from your phone.)
5. Save, then copy the **Client ID** and **Client Secret** — you'll paste these into `.env` in step 5.

**Microsoft:**
1. Go to [portal.azure.com](https://portal.azure.com/) → **App registrations → New registration**.
2. Name it anything. Under **Redirect URI**, choose platform **Web** and enter:
   ```
   http://localhost:3000/auth/microsoft/callback
   ```
   (Same `localhost`-only restriction as Google.)
3. After creating it, go to **Certificates & secrets → New client secret**, create one, and copy its **value** immediately (it's hidden after you leave the page).
4. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, search for and add `Tasks.Read`.
5. Copy the **Application (client) ID** from the app's Overview page.

### 5. Get the code onto the Pi and configure it

```
git clone https://github.com/kevinclayland/WallCalToDo.git
cd WallCalToDo
cp server/.env.example server/.env
nano server/.env
```

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MS_CLIENT_ID`, and
`MS_CLIENT_SECRET` with the values from step 4 (leave the `*_REDIRECT_URI`
lines as they already are). Save and exit nano with `Ctrl+O`, `Enter`,
`Ctrl+X`.

### 6. Install dependencies and build both apps

```
cd ~/WallCalToDo/server && npm install
cd ~/WallCalToDo/frontend && npm install && npm run build
cd ~/WallCalToDo/companion && npm install && npm run build
```

This takes a few minutes on a Pi — that's normal.

### 7. Run the backend as a background service

```
sudo cp ~/WallCalToDo/pi-setup/wallcaltodo.service /etc/systemd/system/
sudo systemctl enable --now wallcaltodo
sudo systemctl status wallcaltodo
```

The status output should say **active (running)**. If it doesn't, run
`sudo journalctl -u wallcaltodo -n 50` to see why — the most common cause
is a typo in `server/.env`.

### 8. Connect your accounts

Do this step on the Pi's own screen (i.e. with a keyboard/mouse on the
monitor connected to the Pi, in its normal desktop — not kiosk mode yet,
and not from your phone). This is required because the redirect URLs
registered in step 4 are `localhost`-only, which only means something to
a browser running on the Pi itself.

1. Open the Pi's Chromium (Menu → Internet → Chromium) and go to:
   ```
   http://localhost:3000/companion
   ```
2. Tap **+ Add Google account**, sign in, grant access. Repeat for every
   Google account you want on the display.
3. Visit `http://localhost:3000/auth/microsoft` once to connect your
   Microsoft To Do account.
4. Back in the companion app, you should see each account listed with its
   calendars — toggle any off you don't want shown.

Then check `http://localhost:3000` in that same browser — you should see
your real events/tasks. If it's empty, give it a minute (it polls every
60 seconds by default) and check `sudo journalctl -u wallcaltodo -f`.

### 9. Rotate the display and enable kiosk mode

Follow **`pi-setup/kiosk/README.md`** — it covers rotating the display to
portrait and setting Chromium to auto-launch full-screen on boot,
depending on your Pi OS version.

Then reboot:

```
sudo reboot
```

The Pi should come back up straight into the full-screen display, already
rotated to portrait.

### 10. Mount it

Physically attach the monitor to the Pi and mount both on the wall.
You're done — from here on, changes to your calendars show up
automatically (see "Auto-update behavior" above).

### Managing it later

From your phone, on the same Wi-Fi, open
`http://wallcaltodo.local:3000/companion` (swap in your own hostname) to
toggle calendars or disconnect an account — this works fine from your
phone. **Adding a brand-new account** still has to be done on the Pi's own
screen, same as step 8 (or via an SSH tunnel — `ssh -L 3000:localhost:3000 pi@wallcaltodo.local`,
then open `http://localhost:3000/companion` on your laptop through the
tunnel — if you'd rather not walk over to the Pi).

### Troubleshooting

- **Can't reach `wallcaltodo.local` from your phone** — not every network/
  device supports `.local` mDNS names. Find the Pi's IP instead: SSH in
  and run `hostname -I`, then use `http://<that-ip>:3000/companion`.
- **Backend won't start** — `sudo systemctl status wallcaltodo` and
  `sudo journalctl -u wallcaltodo -n 50` for the actual error. Usually a
  missing/wrong value in `server/.env`.
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
`/api`, `/auth`, and `/ws` calls to the backend on `:3000`. Since
everything's on `localhost` here, the OAuth connect step just works
directly: open the companion app and use **+ Add Google account**, and
visit `http://localhost:3000/auth/microsoft` once for Microsoft.

To preview the kiosk's portrait layout on a normal monitor, just shrink
the browser window narrow — no special flag needed.

## Design

This repo intentionally ships with placeholder UI only
(`frontend/src/styles/tokens.css` + minimal component markup) — the real
visual design is being done separately as a portfolio piece. Swapping in
the final design should only mean editing `tokens.css` and the component
markup/styles; the data layer (OAuth, polling, WebSocket push) doesn't
need to change.
