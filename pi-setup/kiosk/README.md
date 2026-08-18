# Kiosk autostart

Make the script executable once:

```
chmod +x pi-setup/kiosk/kiosk.sh
```

Then wire it into autostart depending on your Raspberry Pi OS version.

## Bookworm (Wayland / labwc), current Pi OS default

Create/edit `~/.config/labwc/autostart` and add:

```
/home/pi/WallCalToDo/pi-setup/kiosk/kiosk.sh &
```

`xset`/`unclutter` are X11 tools and are no-ops under Wayland (the script
swallows their errors). Screen blanking under labwc is off by default on
Pi OS; if yours isn't, disable it via `wlopm` or your compositor's config.

## Bullseye and earlier (X11 / LXDE)

Edit `~/.config/lxsession/LXDE-pi/autostart` and add:

```
@/home/pi/WallCalToDo/pi-setup/kiosk/kiosk.sh
```

Install `unclutter` if you want the (nonexistent, but just in case) cursor
hidden at the OS level too: `sudo apt install unclutter`.

## Either way

Reboot and the Pi should come up straight into the kiosk. To get back to a
desktop for debugging, SSH in instead of touching the display — kiosk mode
intentionally has no window chrome.
