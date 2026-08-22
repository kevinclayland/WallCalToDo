#!/bin/bash
# Launches Chromium in kiosk mode pointed at the local WallCalToDo server.
# Wire this into your desktop environment's autostart — see README.md in
# this folder for the Wayland/labwc and X11/LXDE variants.

URL="${WALLCALTODO_URL:-http://localhost:3000}"

# Wait for the backend to actually be up before opening the browser.
until curl -sf "$URL/api/status" > /dev/null; do
  sleep 1
done

xset s off -dpms 2>/dev/null           # X11 only: disable screen blanking

# unclutter (X11 only — relies on the XScreenSaver extension, which has
# no Wayland equivalent, so it's a no-op under labwc/Wayland) hides the
# cursor here as a belt-and-suspenders measure. The actual cursor hiding
# that works everywhere, including Wayland, is `cursor: none` baked into
# the page itself (frontend/index.html + base.css) — that's what does the
# real work on a Bookworm/Trixie default install.
command -v unclutter > /dev/null && unclutter -idle 0.5 -root &

# The browser package's binary name varies by Raspberry Pi OS release —
# older ones ship "chromium-browser", newer ones (Trixie-based) just
# "chromium". Use whichever actually exists instead of hardcoding one.
if command -v chromium-browser > /dev/null; then
  BROWSER=chromium-browser
elif command -v chromium > /dev/null; then
  BROWSER=chromium
else
  echo "kiosk.sh: no chromium/chromium-browser binary found" >&2
  exit 1
fi

# --password-store=basic skips the system keyring entirely — minimal
# desktops like labwc don't run/unlock one, so without this flag Chromium
# pops up a keyring-unlock dialog on every launch.
#
# --incognito guarantees every launch is a genuinely fresh session: no
# restored tabs/sessionStorage from a previous run, no stale disk cache.
# A kiosk display that always shows the same one page has no use for
# persisting any of that between boots anyway.
exec "$BROWSER" \
  --kiosk \
  --incognito \
  --password-store=basic \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  "$URL"
