/**
 * Hostname utility functions for domain-based routing
 * Supports multiple domain configurations for different environments
 */

/**
 * Admin domain configuration
 * Add new admin domains here when switching to a new domain
 */
const ADMIN_DOMAINS = [
	'admin.germinalstudio.co', // Production
	'admin-staging.germinalstudio.co', // Staging
	'germinal.henga.dev' // Demo
];

/**
 * Staff domain configuration
 * Add new staff domains here when switching to a new domain
 */
const STAFF_DOMAINS = [
	'staff.germinalstudio.co', // Production
	'staff-staging.germinalstudio.co', // Staging
	'germinal.henga.dev' // Demo
];

/**
 * Detect if request is from admin subdomain
 * Development: localhost and 127.0.0.1 treated as admin domain for convenience
 * Production: checks against configured admin domains
 */
export function isAdminDomain(hostname: string): boolean {
	// Development mode: localhost always acts as admin domain for testing
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return true;
	}

	// Check against configured admin domains
	return ADMIN_DOMAINS.includes(hostname);
}

/**
 * Detect if request is from staff subdomain
 * Development: localhost and 127.0.0.1 treated as staff domain for convenience
 * Production: checks against configured staff domains
 */
export function isStaffDomain(hostname: string): boolean {
	// Development mode: localhost always acts as staff domain for testing
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return true;
	}

	// Check against configured staff domains
	return STAFF_DOMAINS.includes(hostname);
}

/**
 * Get cookie domain for cross-subdomain sessions
 * Returns the parent domain with leading dot to allow subdomains
 * Returns null for localhost (no domain attribute needed)
 */
export function getCookieDomain(hostname: string): string | null {
	// Localhost: don't set domain attribute
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return null;
	}

	// germinalstudio.co domains
	if (hostname.endsWith('.germinalstudio.co') || hostname === 'germinalstudio.co') {
		return '.germinalstudio.co';
	}

	// henga.dev demo domain
	if (hostname === 'germinal.henga.dev') {
		return 'germinal.henga.dev';
	}

	return null;
}

/**
 * Whether the hostname belongs to the staging environment
 */
export function isStagingHost(hostname: string): boolean {
	return (
		hostname === 'staging.germinalstudio.co' ||
		hostname === 'admin-staging.germinalstudio.co' ||
		hostname === 'staff-staging.germinalstudio.co'
	);
}

/**
 * Return the session cookie name for the given hostname.
 * Staging uses a distinct name so it never conflicts with the production
 * cookie that shares the same `.germinalstudio.co` domain.
 */
export function getSessionCookieName(hostname: string): string {
	return isStagingHost(hostname) ? 'session_staging' : 'session';
}

/**
 * Return the CSRF cookie name for the given hostname (same scoping rationale).
 */
export function getCsrfCookieName(hostname: string): string {
	return isStagingHost(hostname) ? 'csrf_token_staging' : 'csrf_token';
}

/**
 * Get the admin URL for the current domain environment
 * Used for redirects after logout, etc.
 */
export function getAdminUrl(hostname: string): string {
	// Localhost: use relative path
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return '';
	}

	// Staging environment
	if (isStagingHost(hostname)) {
		return 'https://admin-staging.germinalstudio.co';
	}

	// Demo domain
	if (hostname === 'germinal.henga.dev') {
		return 'https://germinal.henga.dev';
	}

	return 'https://admin.germinalstudio.co';
}

/**
 * Get the staff URL for the current domain environment
 * Used for redirects, links, etc.
 */
export function getStaffUrl(hostname: string): string {
	// Localhost: use relative path
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return '';
	}

	// Staging environment
	if (isStagingHost(hostname)) {
		return 'https://staff-staging.germinalstudio.co';
	}

	// Demo domain
	if (hostname === 'germinal.henga.dev') {
		return 'https://germinal.henga.dev';
	}

	return 'https://staff.germinalstudio.co';
}
