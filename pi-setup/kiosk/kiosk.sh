#!/bin/bash
# Launches Chromium in kiosk mode pointed at the local WallCalToDo server.
# Wire this into your desktop environment's autostart — see README.md in
# this folder for the Wayland/labwc and X11/LXDE variants.

URL="${WALLCALTODO_URL:-http://localhost:3000}"

# Boot-time diagnostics: every stage below (and Chromium's own
# stdout/stderr) gets timestamped into this file, reset on each run.
# After a boot, read it with:
#   cat ~/wallcaltodo-kiosk.log
LOG_FILE="$HOME/wallcaltodo-kiosk.log"
: > "$LOG_FILE"
log() { echo "$(date -Is) $*" >> "$LOG_FILE"; }

log "kiosk.sh starting (WAYLAND_DISPLAY=$WAYLAND_DISPLAY XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR XDG_SESSION_TYPE=$XDG_SESSION_TYPE)"

# Give the compositor a moment to finish applying the output
# transform/rotation (wlr-randr, run right before this script in
# autostart) before a browser window gets created against it — a
# hypothesis for the "boots to a grey/blank screen until I manually
# refresh" symptom that has NOT yet been confirmed against the real
# failure. Kept because it's harmless, not because it's known to help.
sleep 3
log "settle delay done"

# Wait for the backend to actually be up before opening the browser.
until curl -sf "$URL/api/status" > /dev/null; do
  sleep 1
done
log "backend ready"

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
#
# --disable-gpu forces fully software rendering. This page has no
# animation/scrolling that needs GPU accel, so it's free to keep.
#
# The flags below (--disable-background-networking through
# --disable-domain-reliability) turn off Chromium's own phone-home
# traffic — update checks, GCM registration, optimization-guide model
# fetches, Privacy Sandbox attestations, affiliation lookups, and so
# on. A boot log capture showed a wall of this traffic firing in the
# same few seconds Chromium's network service crashed and had to
# restart — right as it was loading this page. None of that traffic
# does anything useful for a kiosk with no user and no browsing, so
# cutting it lowers memory/CPU contention during the exact startup
# window that crash happened in, on a Pi 3B with only 1GB of RAM.
#
# That crash is the real lead on the grey-screen bug: if it kills the
# in-flight request for this page's own HTML, the page never loads at
# all — meaning none of this page's own JS ever runs, which is why
# every earlier page-JS-based reload attempt could only ever be a
# no-op. The fix below (the wtype block) works at the OS level
# instead, for exactly that reason.
log "launching $BROWSER"
"$BROWSER" \
  --kiosk \
  --incognito \
  --password-store=basic \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --disable-gpu \
  --disable-background-networking \
  --disable-component-update \
  --disable-domain-reliability \
  --disable-sync \
  --disable-translate \
  --no-first-run \
  --enable-logging=stderr --v=0 \
  "$URL" >> "$LOG_FILE" 2>&1 &
CHROMIUM_PID=$!
log "chromium pid=$CHROMIUM_PID"

# Guaranteed recovery for the grey-screen boot: send a real F5 keypress
# to the compositor a minute after launch — the literal action that has
# always fixed this by hand. Sent as an actual synthetic input event
# (not a page-JS reload), it works even in the failure case above where
# the page never loaded in the first place and has no JS running to do
# anything. Runs unconditionally, not just on detected failure: a page
# that's already loaded fine just reloads once, which is a much smaller
# cost than another silent boot to grey.
if command -v wtype > /dev/null; then
  (
    sleep 60
    log "sending synthetic F5 refresh via wtype"
    wtype -k F5
  ) &
else
  log "wtype not installed — skipping synthetic refresh. Install with: sudo apt install wtype"
fi

wait "$CHROMIUM_PID"
