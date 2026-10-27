/**
 * Brevo transactional email (REST API v3, POST /smtp/email). The sender
 * must be on a domain authenticated in Brevo (germinalstudio.co), and the
 * server's IP must be in Brevo's Authorised IPs, or Brevo answers 401.
 */

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 15_000;

export class BrevoError extends Error {}

export interface BrevoAddress {
	email: string;
	name?: string;
}

export interface BrevoEmail {
	sender: BrevoAddress;
	to: BrevoAddress[];
	replyTo?: BrevoAddress;
	subject: string;
	htmlContent: string;
	textContent: string;
}

/** Sends one email through Brevo and returns its message id. Throws a BrevoError on any failure. */
export async function sendBrevoEmail(
	apiKey: string,
	email: BrevoEmail,
	fetchFn: typeof fetch = fetch,
): Promise<string> {
	let response: Response;
	try {
		response = await fetchFn(BREVO_SEND_URL, {
			method: 'POST',
			headers: {
				'api-key': apiKey,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(email),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (err) {
		throw new BrevoError(`Brevo unreachable: ${err instanceof Error ? err.message : String(err)}`);
	}

	const body = (await response.json().catch(() => null)) as
		| { messageId?: string; code?: string; message?: string }
		| null;

	if (!response.ok) {
		// Brevo's error body is { code, message }, e.g. "unauthorized" for an unknown IP.
		throw new BrevoError(`Brevo answered ${response.status}: ${body?.code ?? ''} ${body?.message ?? ''}`.trim());
	}

	return body?.messageId ?? '';
}
