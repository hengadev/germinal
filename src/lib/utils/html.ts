/**
 * Escape HTML special characters to prevent XSS injection
 * This should be used for any user-provided content that will be inserted into HTML
 */
export function escapeHtml(unsafe: string): string {
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Escape HTML special characters in attributes (handles quotes differently)
 */
export function escapeHtmlAttr(unsafe: string): string {
	return String(unsafe)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
