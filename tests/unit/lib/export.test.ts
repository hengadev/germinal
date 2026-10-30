// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Events/Sessions only have bilingual `titleEn`/`titleFr` columns in the schema —
// there is no unified `.title` field. These rows intentionally omit `.title`
// so the test fails loudly (like the real bug did) if the export service
// ever reads that non-existent field again.
const findManyMock = vi.fn();

vi.mock('../../../src/lib/server/db', () => ({
	db: {
		query: {
			reservations: {
				findMany: (...args: unknown[]) => findManyMock(...args),
			},
		},
		// Issue 023: the export also aggregates Check-ins and settler
		// names through db.select chains (which then resolve empty).
		select: () => ({
			from: () => ({
				where: () => {
					const promise = Promise.resolve([]);
					const chain = {
						groupBy: () => promise,
						then: (onFulfilled, onRejected) =>
							promise.then(onFulfilled, onRejected),
					};
					return chain;
				},
			}),
		}),
	},
}));

describe('exportReservationsToCSV', () => {
	it('does not throw when a search term is supplied, and matches on titleEn/titleFr', async () => {
		findManyMock.mockReturnValue(
			Promise.resolve([
					{
						id: 'r1',
						guestName: 'Alice Example',
						guestEmail: 'alice@example.com',
						guestPhone: null,
						notificationPreference: 'email',
						quantity: 2,
						totalAmount: 5000,
						currency: 'EUR',
						status: 'confirmed',
						confirmedAt: new Date('2026-01-01T00:00:00Z'),
						createdAt: new Date('2026-01-01T00:00:00Z'),
						payment: null,
						eventSession: {
							titleEn: 'Opening Night',
							titleFr: "Soirée d'ouverture",
							startTime: new Date('2026-01-02T20:00:00Z'),
							endTime: new Date('2026-01-02T23:00:00Z'),
							event: {
								titleEn: 'Summer Festival',
								titleFr: "Festival d'été",
							},
						},
					},
					{
						id: 'r2',
						guestName: 'Bob Example',
						guestEmail: 'bob@example.com',
						guestPhone: null,
						notificationPreference: 'email',
						quantity: 1,
						totalAmount: 2500,
						currency: 'EUR',
						status: 'confirmed',
						confirmedAt: new Date('2026-01-01T00:00:00Z'),
						createdAt: new Date('2026-01-01T00:00:00Z'),
						payment: null,
						eventSession: {
							titleEn: 'Closing Party',
							titleFr: 'Fête de clôture',
							startTime: new Date('2026-01-03T20:00:00Z'),
							endTime: new Date('2026-01-03T23:00:00Z'),
							event: {
								titleEn: 'Winter Gala',
								titleFr: "Gala d'hiver",
							},
						},
					},
				]),
		);

		const { exportReservationsToCSV } = await import(
			'../../../src/lib/server/services/export'
		);

		// Before the fix, filtering by search threw because it read a
		// non-existent `.title` field instead of `.titleEn`/`.titleFr`.
		const csv = await exportReservationsToCSV({ search: 'festival' });

		expect(csv).toContain('Summer Festival');
		expect(csv).toContain('Opening Night');
		expect(csv).not.toContain('Winter Gala');
	});
	it('exports the Dietary Requirements and their consent instant (issue 041)', async () => {
		findManyMock.mockReturnValue(
			Promise.resolve([
				{
					id: 'r3',
					guestName: 'Chloé Example',
					guestEmail: 'chloe@example.com',
					guestPhone: null,
					notificationPreference: 'email',
					quantity: 2,
					totalAmount: 5000,
					currency: 'EUR',
					status: 'confirmed',
					dietaryRequirements: 'Allergie aux noix, végétarienne',
					dietaryConsentAt: new Date('2026-01-01T10:00:00Z'),
					confirmedAt: new Date('2026-01-01T00:00:00Z'),
					createdAt: new Date('2026-01-01T00:00:00Z'),
					payment: null,
					eventSession: {
						titleEn: 'Opening Night',
						titleFr: "Soirée d'ouverture",
						startTime: new Date('2026-01-02T20:00:00Z'),
						endTime: new Date('2026-01-02T23:00:00Z'),
						event: { titleEn: 'Summer Festival', titleFr: "Festival d'été" },
					},
				},
			]),
		);

		const { exportReservationsToCSV } = await import('../../../src/lib/server/services/export');
		const [header, row] = (await exportReservationsToCSV()).split('\n');

		const columns = header.split(',');
		expect(columns).toContain('Dietary Requirements');
		expect(columns).toContain('Dietary Consent At');
		expect(row).toContain('"Allergie aux noix, végétarienne"');
		expect(row).toContain('2026-01-01 10:00:00');
	});
});

describe('arrayToCSV — formula neutralisation', () => {
	async function writer() {
		return (await import('../../../src/lib/server/services/export')).arrayToCSV;
	}

	it.each(['=1+1', '+33 6 12 34 56 78', '-2+3', '@SUM(A1)', '\tx', '\r=1'])(
		'prefixes the string cell %j with a single quote',
		async (value) => {
			const arrayToCSV = await writer();
			const [, row] = arrayToCSV([{ Note: value }], ['Note']).split('\n');
			expect(row.replace(/^"|"$/g, '').startsWith(`'${value[0]}`)).toBe(true);
		}
	);

	it('leaves numbers and dates untouched, so negative amounts stay numeric', async () => {
		const arrayToCSV = await writer();
		const csv = arrayToCSV(
			[{ Amount: -12.5, At: new Date('2026-01-02T03:04:05Z'), Plain: 'Vegetarian' }],
			['Amount', 'At', 'Plain']
		);
		expect(csv.split('\n')[1]).toBe('-12.5,2026-01-02 03:04:05,Vegetarian');
	});

	it('still quotes commas, quotes and newlines after neutralising', async () => {
		const arrayToCSV = await writer();
		const csv = arrayToCSV(
			[{ A: '=HYPERLINK("x","y")', B: 'a,b', C: 'line1\nline2' }],
			['A', 'B', 'C']
		);
		expect(csv).toBe('A,B,C\n"\'=HYPERLINK(""x"",""y"")","a,b","line1\nline2"');
	});

	it('neutralises Guest-supplied text in the Reservations export', async () => {
		findManyMock.mockResolvedValueOnce([
			{
				id: 'r-formula',
				guestName: '=cmd|" /C calc"!A0',
				guestEmail: 'eve@example.com',
				guestPhone: null,
				notificationPreference: 'email',
				quantity: 1,
				totalAmount: 1000,
				currency: 'EUR',
				status: 'confirmed',
				isComp: false,
				dietaryRequirements: '@SUM(1)',
				confirmedAt: null,
				createdAt: new Date('2026-01-01T00:00:00Z'),
				payment: null,
				eventSession: {
					titleEn: 'Night',
					titleFr: 'Nuit',
					startTime: new Date('2026-01-02T20:00:00Z'),
					endTime: new Date('2026-01-02T23:00:00Z'),
					event: { titleEn: 'Event', titleFr: 'Événement', timeZone: 'Europe/Paris' },
				},
			},
		]);
		const { exportReservationsToCSV } = await import('../../../src/lib/server/services/export');
		const csv = await exportReservationsToCSV();
		expect(csv).toContain(`"'=cmd|"" /C calc""!A0"`);
		expect(csv).toContain(`'@SUM(1)`);
		expect(csv).not.toMatch(/(^|,)=cmd/m);
	});
});
