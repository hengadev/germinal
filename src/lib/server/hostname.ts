/**
 * Hostname utility functions for domain-based routing
 * Supports admin.germinalstudio.co subdomain architecture
 */

/**
 * Detect if request is from admin subdomain
 * Development: localhost and 127.0.0.1 treated as admin domain for convenience
 * Production: exact match for admin.germinalstudio.co
 */
export function isAdminDomain(hostname: string): boolean {
	// Development mode: localhost always acts as admin domain for testing
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return true;
	}

	// Production: exact match for admin subdomain
	return hostname === 'admin.germinalstudio.co';
}

/**
 * Get cookie domain for cross-subdomain sessions
 * Returns: .germinalstudio.co (leading dot allows subdomains)
 * Returns: null for localhost (no domain attribute needed)
 */
export function getCookieDomain(hostname: string): string | null {
	// Localhost: don't set domain attribute
	if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
		return null;
	}

	// Production: use parent domain with leading dot to allow subdomains
	return '.germinalstudio.co';
}
