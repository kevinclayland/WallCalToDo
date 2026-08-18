#!/usr/bin/env python3
"""Physical view-switch button for WallCalToDo.

Wire a momentary push button between GPIO17 (BCM numbering) and GND.
gpiozero's Button enables the Pi's internal pull-up resistor, so no
external resistor is needed — the pin reads high normally and low when
pressed.

On each press this posts to the server's toggle endpoint, which flips the
current view server-side and broadcasts the change to every connected
display over the existing WebSocket connection (see
server/src/routes/api.js and server/src/ws/hub.js). The display updates
immediately; no polling or page refresh involved.
"""
import os
import urllib.request
from signal import pause

from gpiozero import Button

GPIO_PIN = int(os.environ.get("WALLCALTODO_BUTTON_PIN", 17))
SERVER_URL = os.environ.get("WALLCALTODO_SERVER_URL", "http://localhost:3000")
TOGGLE_URL = f"{SERVER_URL}/api/view/toggle"
BOUNCE_TIME = 0.2  # seconds — debounces a noisy mechanical switch


def toggle_view():
    try:
        urllib.request.urlopen(urllib.request.Request(TOGGLE_URL, method="POST"), timeout=5)
    except Exception as err:  # keep the service running even if the backend is briefly down
        print(f"[button] failed to toggle view: {err}")


button = Button(GPIO_PIN, bounce_time=BOUNCE_TIME)
button.when_pressed = toggle_view

print(f"[button] listening on GPIO{GPIO_PIN}, posting to {TOGGLE_URL}")
pause()
