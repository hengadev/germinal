/**
 * Guest identity (issue 049): a Guest is their email, lower-cased and
 * trimmed. The Admin Clients page addresses a Guest by a URL-safe key —
 * base64url of the normalised email — so the raw email never appears in
 * a URL.
 */

/** Trim and lower-case an email; null when there is nothing left. */
export function normaliseEmail(raw: string | null | undefined): string | null {
	const value = (raw ?? '').trim().toLowerCase();
	return value.length > 0 ? value : null;
}

/** URL-safe (base64url) key for a normalised email. */
export function guestKeyFromEmail(raw: string | null | undefined): string | null {
	const email = normaliseEmail(raw);
	if (email === null) return null;
	const bytes = new TextEncoder().encode(email);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The normalised email for a Guest key, or null if the key is invalid. */
export function emailFromGuestKey(key: string): string | null {
	if (!/^[A-Za-z0-9_-]*$/.test(key)) return null;
	try {
		const padded = key.replace(/-/g, '+').replace(/_/g, '/');
		const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		return normaliseEmail(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
}
