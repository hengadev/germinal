// @vitest-environment node
//
// Issue 069 — « Privatisation » on the contact form and the « Demandes »
// inbox. A private-event submission stores the extra fields; the inbox hides
// honeypot-flagged submissions and filters by type and status; status and
// note updates work; the sidebar badge counts only « nouvelle » demandes.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { contactSubmissions } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
	isBrevoConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

const sendContactEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/server/services/email', () => ({
	sendContactEmail,
}));

const load = async () => await import('../../src/lib/server/services/contact');

beforeEach(async () => {
	await setupTestDatabase();
	vi.clearAllMocks();
});

afterAll(async () => {
	await closeTestDatabase();
});

describe('privatisation demandes (issue 069)', () => {
	it('stores the privatisation fields and sends them in the alert email', async () => {
		const submission = await (await load()).createContactSubmission({
			name: 'Jane Doe',
			email: 'jane@example.com',
			company: null,
			inquiryType: 'private_event',
			message: 'We would like to privatise the studio for our gala.',
			occasion: 'Gala annuel',
			preferredDates: 'juin ou septembre',
			guestCount: 80,
			budget: '5 000 €',
			honeypot: null,
			ipAddress: '127.0.0.1',
			userAgent: 'test',
		});

		expect(submission.occasion).toBe('Gala annuel');
		expect(submission.preferredDates).toBe('juin ou septembre');
		expect(submission.guestCount).toBe(80);
		expect(submission.budget).toBe('5 000 €');
		expect(submission.status).toBe('new');

		expect(sendContactEmail).toHaveBeenCalledTimes(1);
		const emailData = sendContactEmail.mock.calls[0][0];
		expect(emailData.occasion).toBe('Gala annuel');
		expect(emailData.guestCount).toBe(80);
		expect(emailData.budget).toBe('5 000 €');
	});

	it('existing rows and new ones default to status nouvelle', async () => {
		await testDb.insert(contactSubmissions).values({
			name: 'Old Visitor',
			email: 'old@example.com',
			inquiryType: 'other',
			message: 'A pre-existing message.',
		});
		const demandes = await (await load()).listDemandes({});
		const old = demandes.find((d) => d.email === 'old@example.com');
		expect(old?.status).toBe('new');
	});

	it('hides honeypot-flagged submissions from the inbox and the badge', async () => {
		await testDb.insert(contactSubmissions).values([
			{
				name: 'Real',
				email: 'real@example.com',
				inquiryType: 'private_event',
				message: 'A real demande.',
			},
			{
				name: 'Bot',
				email: 'bot@example.com',
				inquiryType: 'other',
				message: 'Spam message.',
				honeypot: 'http://spam.example',
			},
		]);

		const demandes = await (await load()).listDemandes({});
		expect(demandes).toHaveLength(1);
		expect(demandes[0].email).toBe('real@example.com');

		expect(await (await load()).countNewDemandes()).toBe(1);
	});

	it('filters by inquiry type and status', async () => {
		const [privateOne] = await testDb
			.insert(contactSubmissions)
			.values([
				{
					name: 'A',
					email: 'a@example.com',
					inquiryType: 'private_event',
					message: 'Privatisation.',
				},
				{
					name: 'B',
					email: 'b@example.com',
					inquiryType: 'other',
					message: 'Autre demande.',
				},
			])
			.returning();

		expect((await (await load()).listDemandes({ inquiryType: 'private_event' })).map((d) => d.email)).toEqual([
			'a@example.com',
		]);

		await (await load()).updateDemande(privateOne.id, { status: 'quote_sent' });
		expect((await (await load()).listDemandes({ status: 'new' })).map((d) => d.email)).toEqual(['b@example.com']);
		expect((await (await load()).listDemandes({ status: 'quote_sent' })).map((d) => d.email)).toEqual([
			'a@example.com',
		]);
	});

	it('updates the status and the private note', async () => {
		const [row] = await testDb
			.insert(contactSubmissions)
			.values({
				name: 'C',
				email: 'c@example.com',
				inquiryType: 'private_event',
				message: 'Privatisation en mars.',
			})
			.returning();

		expect(await (await load()).countNewDemandes()).toBe(1);

		const updated = await (await load()).updateDemande(row.id, {
			status: 'discussing',
			adminNote: 'Rappeler la semaine prochaine.',
		});
		expect(updated.status).toBe('discussing');
		expect(updated.adminNote).toBe('Rappeler la semaine prochaine.');

		// The badge no longer counts the demande.
		expect(await (await load()).countNewDemandes()).toBe(0);

		await expect((await load()).updateDemande(row.id, { status: 'nope' })).rejects.toThrow('Invalid status');
	});
});
