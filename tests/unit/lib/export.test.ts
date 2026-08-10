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
	},
}));

describe('exportReservationsToCSV', () => {
	it('does not throw when a search term is supplied, and matches on titleEn/titleFr', async () => {
		findManyMock.mockReturnValue({
			limit: () =>
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
		});

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
});
