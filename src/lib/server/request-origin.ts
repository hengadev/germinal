/**
 * Cross-origin check for unsafe methods (security audit, Module 4).
 *
 * SvelteKit's built-in CSRF check only covers form content types, so a POST
 * with no body (an Admin Reservation cancel+refund, a logout) gets through,
 * and `SameSite=Lax` doesn't help: every `*.germinalstudio.co` origin is the
 * same site. This predicate runs in the server hook before routing and
 * rejects any POST/PUT/PATCH/DELETE the browser marks as coming from another
 * origin.
 *
 * Requests carrying neither `Origin` nor `Sec-Fetch-Site` pass: only
 * non-browser callers send neither, and they carry no ambient cookies. The
 * custom double-submit CSRF token on the public endpoints stays as is.
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Paths called server-to-server by third parties, exempt from the check. */
const EXEMPT_PATHS = new Set(['/api/webhooks/stripe']);

const SAME_ORIGIN_FETCH_SITES = new Set(['same-origin', 'none']);

/**
 * Whether a request must be rejected as a cross-origin browser request with
 * an unsafe method. `url` is the request's own URL (its origin is the one
 * the request was addressed to).
 */
export function isCrossOriginUnsafeRequest(request: Request, url: URL): boolean {
	if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;
	if (EXEMPT_PATHS.has(url.pathname)) return false;

	const origin = request.headers.get('origin');
	if (origin !== null && origin !== url.origin) return true;

	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite !== null && !SAME_ORIGIN_FETCH_SITES.has(fetchSite)) return true;

	return false;
}
