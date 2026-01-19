/**
 * Sensitive Data Redaction Utilities
 * Automatically redacts sensitive information from logs and error messages
 */

const SENSITIVE_PATTERNS = [
	{
		pattern: /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
		replacement: 'password=[REDACTED]',
	},
	{
		pattern: /token["']?\s*[:=]\s*["']?[^"'\s]+/gi,
		replacement: 'token=[REDACTED]',
	},
	{
		pattern: /secret["']?\s*[:=]\s*["']?[^"'\s]+/gi,
		replacement: 'secret=[REDACTED]',
	},
	{
		pattern: /api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
		replacement: 'api_key=[REDACTED]',
	},
	{
		pattern: /access[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
		replacement: 'access_key=[REDACTED]',
	},
	{
		pattern: /access[_-]?token["']?\s*[:=]\s*["']?[^"'\s]+/gi,
		replacement: 'access_token=[REDACTED]',
	},
	{
		pattern: /sk_[a-zA-Z0-9]{24,}/g,
		replacement: '[STRIPE_KEY]',
	},
	{
		pattern: /pk_[a-zA-Z0-9]{24,}/g,
		replacement: '[STRIPE_KEY]',
	},
	{
		pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
		replacement: 'Bearer [TOKEN]',
	},
	{
		pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
		replacement: '[EMAIL]',
	},
	{
		pattern: /Authorization:\s*[A-Za-z0-9\-._~+/]+/gi,
		replacement: 'Authorization: [REDACTED]',
	},
];

const SENSITIVE_KEYS = [
	'password',
	'password_hash',
	'passwd',
	'secret',
	'api_key',
	'apikey',
	'access_key',
	'accesskey',
	'access_token',
	'accesstoken',
	'auth_token',
	'authtoken',
	'refresh_token',
	'refreshtoken',
	'client_secret',
	'clientsecret',
	'session_token',
	'sessiontoken',
	'csrf_token',
	'csrftoken',
];

/**
 * Recursively redact sensitive data from an object or string
 * @param data - Data to redact
 * @returns Redacted data
 */
export function redactSensitiveData(data: unknown): unknown {
	if (typeof data === 'string') {
		let redacted = data;
		SENSITIVE_PATTERNS.forEach(({ pattern, replacement }) => {
			redacted = redacted.replace(pattern, replacement);
		});
		return redacted;
	}

	if (typeof data === 'number' || typeof data === 'boolean' || data === null) {
		return data;
	}

	if (typeof data === 'object' && data !== null) {
		if (Array.isArray(data)) {
			return data.map(item => redactSensitiveData(item));
		}

		return Object.fromEntries(
			Object.entries(data).map(([key, value]) => {
				// Check if key is sensitive
				const isSensitiveKey = SENSITIVE_KEYS.some(sensitiveKey =>
					key.toLowerCase().includes(sensitiveKey)
				);

				return [
					key,
					isSensitiveKey ? '[REDACTED]' : redactSensitiveData(value),
				];
			})
		);
	}

	return data;
}

/**
 * Redact a specific field value
 * @param key - Field key to check
 * @param value - Field value to redact
 * @returns Redacted value or original if not sensitive
 */
export function redactField(key: string, value: unknown): unknown {
	const isSensitiveKey = SENSITIVE_KEYS.some(sensitiveKey =>
		key.toLowerCase().includes(sensitiveKey)
	);

	return isSensitiveKey ? '[REDACTED]' : value;
}

/**
 * Redact error stack trace to hide sensitive URLs/paths
 * @param error - Error object
 * @returns Redacted error
 */
export function redactError(error: Error): Error {
	const redactedMessage = redactSensitiveData(error.message);
	const redactedError = new Error(typeof redactedMessage === 'string' ? redactedMessage : String(redactedMessage));
	redactedError.name = error.name;
	redactedError.stack = error.stack;

	if (redactedError.stack) {
		redactedError.stack = redactSensitiveData(redactedError.stack) as string;
	}

	return redactedError;
}

/**
 * Check if a key is sensitive
 * @param key - Key to check
 * @returns True if key is sensitive
 */
export function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEYS.some(sensitiveKey =>
		key.toLowerCase().includes(sensitiveKey)
	);
}
