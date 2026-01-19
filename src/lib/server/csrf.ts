import crypto from 'crypto';
import { error } from '@sveltejs/kit';

/**
 * Generate a cryptographically secure CSRF token
 * @returns Hex-encoded random token
 */
export function generateToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate a CSRF token using constant-time comparison
 * Prevents timing attacks
 * @param token - Token to validate (from request)
 * @param sessionToken - Expected token (from session)
 * @returns True if tokens match
 */
export function validateToken(token: string, sessionToken: string): boolean {
	if (!token || !sessionToken || token.length !== sessionToken.length) {
		return false;
	}

	try {
		return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken));
	} catch {
		return false;
	}
}

/**
 * Server-side validation for API requests using X-CSRF-Token header
 * @param request - Request object
 * @param sessionToken - Expected CSRF token from session
 * @returns True if header token matches session token
 */
export function validateCsrfToken(request: Request, sessionToken: string): boolean {
	const token = request.headers.get('x-csrf-token');
	return token ? validateToken(token, sessionToken) : false;
}

/**
 * Validate CSRF token from form data
 * @param formData - FormData from request
 * @param sessionToken - Expected CSRF token from session
 * @returns True if form token matches session token
 */
export function validateCsrfTokenFromForm(formData: FormData | URLSearchParams, sessionToken: string): boolean {
	const token = formData.get('csrf_token');
	return typeof token === 'string' ? validateToken(token, sessionToken) : false;
}
