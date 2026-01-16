/**
 * Hostname utility functions for domain-based routing
 * Supports multiple domain configurations for different environments
 */

/**
 * Admin domain configuration
 * Add new admin domains here when switching to a new domain
 */
const ADMIN_DOMAINS = [
	'admin.henga.dev', // Production
	'dev-admin.henga.dev', // Development
	'admin.germinalstudio.co' // Future domain
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
 * Get cookie domain for cross-subdomain sessions
 * Returns the parent domain with leading dot to allow subdomains
 * Returns null for localhost (no domain attribute needed)
 */
export function getCookieDomain(hostname: string): string | null {
	// Localhost: don't set domain attribute
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return null;
	}

	// henga.dev domains
	if (hostname.endsWith('.henga.dev')) {
		return '.henga.dev';
	}

	// germinalstudio.co domains
	if (hostname.endsWith('.germinalstudio.co') || hostname === 'germinalstudio.co') {
		return '.germinalstudio.co';
	}

	return null;
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

	// henga.dev dev environment (dev-germinal.henga.dev or dev-admin.henga.dev)
	if (hostname.startsWith('dev-') && hostname.endsWith('.henga.dev')) {
		return 'https://dev-admin.henga.dev';
	}

	// henga.dev production environment
	if (hostname.endsWith('.henga.dev')) {
		return 'https://admin.henga.dev';
	}

	// Default to germinalstudio.co
	return 'https://admin.germinalstudio.co';
}
