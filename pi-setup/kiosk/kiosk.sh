#!/bin/bash
# Launches Chromium in kiosk mode pointed at the local WallCalToDo server.
# Wire this into your desktop environment's autostart — see README.md in
# this folder for the Wayland/labwc and X11/LXDE variants.

URL="${WALLCALTODO_URL:-http://localhost:3000}"

# Wait for the backend to actually be up before opening the browser.
until curl -sf "$URL/api/status" > /dev/null; do
  sleep 1
done

xset s off -dpms 2>/dev/null   # X11 only: disable screen blanking
unclutter -idle 0.5 -root &    # X11 only: hide the mouse cursor, if installed

exec chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  "$URL"
