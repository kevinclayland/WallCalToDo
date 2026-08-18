# Kiosk autostart

Make the script executable once:

```
chmod +x pi-setup/kiosk/kiosk.sh
```

Then wire it into autostart depending on your Raspberry Pi OS version. The
display also needs to be rotated at the OS level to match how the monitor
is physically mounted in portrait — the browser layout assumes a tall,
narrow viewport (see the root README's "Portrait orientation" section for
background).

## Bookworm (Wayland / labwc), current Pi OS default

Find your output name with `wlr-randr` (e.g. `HDMI-A-1`), then create/edit
`~/.config/labwc/autostart` and add:

```
wlr-randr --output HDMI-A-1 --transform 90
/home/pi/WallCalToDo/pi-setup/kiosk/kiosk.sh &
```

Use `--transform 270` instead of `90` if the display comes up upside down
for your particular mounting orientation.

`xset`/`unclutter` are X11 tools and are no-ops under Wayland (the script
swallows their errors). Screen blanking under labwc is off by default on
Pi OS; if yours isn't, disable it via `wlopm` or your compositor's config.

## Bullseye and earlier (X11 / LXDE)

Find your output name with `xrandr` (no args), then edit
`~/.config/lxsession/LXDE-pi/autostart` and add:

```
@xrandr --output HDMI-1 --rotate left
@/home/pi/WallCalToDo/pi-setup/kiosk/kiosk.sh
```

Use `--rotate right` instead of `left` if it comes out upside down.

Install `unclutter` if you want the (nonexistent, but just in case) cursor
hidden at the OS level too: `sudo apt install unclutter`.

## Either way

Reboot and the Pi should come up straight into the kiosk. To get back to a
desktop for debugging, SSH in instead of touching the display — kiosk mode
intentionally has no window chrome.
