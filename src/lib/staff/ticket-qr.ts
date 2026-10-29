/**
 * Parsing of Ticket QR codes.
 *
 * A Ticket QR encodes a link whose path is `/tickets/<token>`.
 * Anything else is not a Ticket QR and must be ignored by the scanner.
 */

const TICKET_PATH = /^\/tickets\/([^/?#]+)\/?$/;

/** Returns the token of a `/tickets/<token>` link, or null for any other content. */
export function parseTicketToken(raw: string): string | null {
	if (!raw) return null;

	let pathname: string | null = null;
	try {
		pathname = new URL(raw).pathname;
	} catch {
		// Not an absolute URL: maybe a bare path.
		pathname = raw.startsWith('/') ? raw : null;
	}
	if (pathname === null) return null;

	const match = TICKET_PATH.exec(pathname);
	return match ? decodeURIComponent(match[1]) : null;
}
