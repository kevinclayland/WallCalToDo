// The OAuth redirect URI registered with Google/Microsoft is hardcoded to
// http://localhost:3000/... (required — both providers only allow plain
// http:// for the literal loopback address). So the final leg of the
// connect flow only reaches this server when the browser doing it is
// running on the Pi itself, at that exact hostname; from any other device
// (e.g. a phone on the same Wi-Fi, even via this same companion app) it
// looks like it's working right up through Google/Microsoft's own consent
// screen, then silently fails on the redirect back. Gate the buttons on
// that same condition instead of letting it fail confusingly.
export const CAN_ADD_ACCOUNTS = ['localhost', '127.0.0.1'].includes(window.location.hostname);
