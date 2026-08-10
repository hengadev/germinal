// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

async function expectRejectedWith(promise: Promise<unknown>, status: number) {
	try {
		await promise;
		expect.unreachable('expected handler to throw');
	} catch (e) {
		expect(isHttpError(e)).toBe(true);
		if (isHttpError(e)) expect(e.status).toBe(status);
	}
}

const staffUser = { id: '1', email: 'a@a.com', role: 'staff', createdAt: new Date() };

describe('CSV export endpoints — auth guard', () => {
	it('analytics export rejects unauthenticated request', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/analytics/+server');
		await expectRejectedWith(
			GET!({ locals: { user: null }, url: new URL('http://x/admin/export/analytics') } as any),
			401,
		);
	});

	it('analytics export rejects non-admin (staff) session', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/analytics/+server');
		await expectRejectedWith(
			GET!({ locals: { user: staffUser }, url: new URL('http://x/admin/export/analytics') } as any),
			403,
		);
	});

	it('payments export rejects unauthenticated request', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/payments/+server');
		await expectRejectedWith(
			GET!({ locals: { user: null }, url: new URL('http://x/admin/export/payments') } as any),
			401,
		);
	});

	it('payments export rejects non-admin (staff) session', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/payments/+server');
		await expectRejectedWith(
			GET!({ locals: { user: staffUser }, url: new URL('http://x/admin/export/payments') } as any),
			403,
		);
	});

	it('reservations export rejects unauthenticated request', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/reservations/+server');
		await expectRejectedWith(
			GET!({ locals: { user: null }, url: new URL('http://x/admin/export/reservations') } as any),
			401,
		);
	});

	it('reservations export rejects non-admin (staff) session', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/reservations/+server');
		await expectRejectedWith(
			GET!({ locals: { user: staffUser }, url: new URL('http://x/admin/export/reservations') } as any),
			403,
		);
	});

	it('waitlist export rejects unauthenticated request', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/waitlist/+server');
		await expectRejectedWith(
			GET!({ locals: { user: null }, url: new URL('http://x/admin/export/waitlist') } as any),
			401,
		);
	});

	it('waitlist export rejects non-admin (staff) session', async () => {
		const { GET } = await import('../../../src/routes/(admin)/admin/export/waitlist/+server');
		await expectRejectedWith(
			GET!({ locals: { user: staffUser }, url: new URL('http://x/admin/export/waitlist') } as any),
			403,
		);
	});
});
