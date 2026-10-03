# Privacy Policy — WallCalToDo

WallCalToDo is a personal, non-commercial, open-source project. It's a
self-hosted display you run on your own Raspberry Pi, on your own network —
there is no central WallCalToDo server, company, or account system. This
page explains what data the software touches and what it does with it.

## What this app accesses

- **Google Calendar** — read-only (`calendar.readonly` scope), plus your
  Google account email (`userinfo.email`) so the companion app can show
  which account is connected. It cannot create, edit, or delete anything
  in your Google Calendar.
- **Microsoft To Do** — read-only (`Tasks.Read` scope). It cannot create,
  edit, or delete tasks in your Microsoft account. (It can remove a
  completed task from its own local cache — see "Where your data lives"
  below — but that never touches the real task in Microsoft To Do.)

No other account data (email content, contacts, files, etc.) is ever
requested from either provider.

## Where your data lives

Everything this software reads is cached in plain JSON files on the same
device you run it on (your Raspberry Pi) and shown on your display and
in its companion app over your own local network. It is never sent to
any third-party server, analytics service, or anyone else — including
the developer of this project. There is no tracking, no telemetry, and
no advertising anywhere in this software.

## Other third-party services used

Two optional features make their own outbound requests, independent of
your Google/Microsoft accounts:

- **Weather** — if you set a location, your coordinates are sent to
  [Open-Meteo](https://open-meteo.com) to fetch a current temperature
  and air-quality reading. No account or API key is involved.
- **Location search** — typing a city name to set your location sends
  that search text to [OpenStreetMap's Nominatim](https://nominatim.org)
  geocoding service. No account or API key is involved.

Neither service receives your name, email, or any calendar/to-do data —
only the location text or coordinates you explicitly enter.

## Disconnecting / revoking access

You can disconnect either account at any time from the companion app,
which deletes its stored tokens and cached data from your device
immediately. You can also revoke access directly from your
[Google Account permissions](https://myaccount.google.com/permissions)
or [Microsoft account permissions](https://account.live.com/consent/Manage)
page at any time, independent of this app.

## Questions

This is a hobby project without a support team. If you have questions
about this policy or the project itself, open an issue on the
[GitHub repository](https://github.com/kevinclayland/WallCalToDo).
