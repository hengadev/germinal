import { describe, it, expect, vi } from 'vitest';
import { sendBrevoEmail, BrevoError, type BrevoEmail } from '../../../src/lib/server/services/brevo';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const email: BrevoEmail = {
	sender: { email: 'noreply@germinalstudio.co', name: 'Germinal' },
	to: [{ email: 'contact@germinalstudio.co' }],
	replyTo: { email: 'guest@example.com', name: 'A Guest' },
	subject: 'New Contact Form Submission from A Guest',
	htmlContent: '<p>Hello</p>',
	textContent: 'Hello',
};

describe('sendBrevoEmail', () => {
	it('posts the email to Brevo with the API key and returns the message id', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ messageId: '<abc@smtp-relay.mailin.fr>' }, 201));

		expect(await sendBrevoEmail('xkeysib-test', email, fetchFn)).toBe('<abc@smtp-relay.mailin.fr>');
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe('https://api.brevo.com/v3/smtp/email');
		expect(init?.method).toBe('POST');
		expect((init?.headers as Record<string, string>)['api-key']).toBe('xkeysib-test');
		expect(JSON.parse(init?.body as string)).toEqual(email);
	});

	it("throws Brevo's error when it refuses the email", async () => {
		const fetchFn = vi.fn<typeof fetch>(async () =>
			jsonResponse({ code: 'unauthorized', message: 'We have detected you are using an unrecognised IP address' }, 401),
		);

		await expect(sendBrevoEmail('xkeysib-test', email, fetchFn)).rejects.toThrow(
			/401: unauthorized We have detected you are using an unrecognised IP address/,
		);
	});

	it('throws a BrevoError when Brevo is unreachable', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => {
			throw new TypeError('fetch failed');
		});

		await expect(sendBrevoEmail('xkeysib-test', email, fetchFn)).rejects.toBeInstanceOf(BrevoError);
	});
});
