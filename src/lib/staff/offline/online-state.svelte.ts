/**
 * Issue 060 — the phone's view of the network: `navigator.onLine` plus the
 * online/offline events, and `markOffline()` for a request that fails at
 * the network level (a fetch that throws a TypeError) — the browser does
 * not always fire the offline event before that.
 */
import { browser } from '$app/environment';

export const onlineState = $state({ online: browser ? navigator.onLine : true });

/** A request just failed at the network level: the phone is offline. */
export function markOffline() {
	onlineState.online = false;
}

/** A request just reached the server: the phone is online again, even if
 * the browser never fired the offline event (a weak network). */
export function markOnline() {
	onlineState.online = true;
}

if (browser) {
	addEventListener('online', () => (onlineState.online = true));
	addEventListener('offline', () => (onlineState.online = false));
}
