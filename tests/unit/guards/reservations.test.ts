// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

async function expectRejectedWith(promise: Promise<unknown>, status: number) {
	try {
		await promise;
		expect.unreachable('expected action to throw');
	} catch (e) {
		expect(isHttpError(e)).toBe(true);
		if (isHttpError(e)) expect(e.status).toBe(status);
	}
}

const staffUser = { id: '1', email: 'a@a.com', role: 'staff', createdAt: new Date() };

describe('reservation admin actions — auth guard', () => {
	it('refund rejects unauthenticated request — no Stripe call happens', async () => {
		const { actions } = await import(
			'../../../src/routes/(admin)/admin/reservations/[id]/+page.server'
		);
		await expectRejectedWith(
			actions.refund!(
				{
					locals: { user: null },
					request: new Request('http://x', { method: 'POST' }),
					params: { id: 'r1' }
				} as any
			),
			401
		);
	});

	it('refund rejects non-admin (staff) session', async () => {
		const { actions } = await import(
			'../../../src/routes/(admin)/admin/reservations/[id]/+page.server'
		);
		await expectRejectedWith(
			actions.refund!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' }),
					params: { id: 'r1' }
				} as any
			),
			403
		);
	});

	it('cancel rejects unauthenticated request', async () => {
		const { actions } = await import(
			'../../../src/routes/(admin)/admin/reservations/[id]/+page.server'
		);
		await expectRejectedWith(
			actions.cancel!(
				{
					locals: { user: null },
					request: new Request('http://x', { method: 'POST' }),
					params: { id: 'r1' }
				} as any
			),
			401
		);
	});

	it('cancel rejects non-admin (staff) session', async () => {
		const { actions } = await import(
			'../../../src/routes/(admin)/admin/reservations/[id]/+page.server'
		);
		await expectRejectedWith(
			actions.cancel!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' }),
					params: { id: 'r1' }
				} as any
			),
			403
		);
	});

	it('reminder rejects unauthenticated request', async () => {
		const { actions } = await import(
			'../../../src/routes/(admin)/admin/reservations/[id]/+page.server'
		);
		await expectRejectedWith(
			actions.reminder!(
				{
					locals: { user: null },
					request: new Request('http://x', { method: 'POST' }),
					params: { id: 'r1' }
				} as any
			),
			401
		);
	});

	it('reminder rejects non-admin (staff) session', async () => {
		const { actions } = await import(
			'../../../src/routes/(admin)/admin/reservations/[id]/+page.server'
		);
		await expectRejectedWith(
			actions.reminder!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' }),
					params: { id: 'r1' }
				} as any
			),
			403
		);
	});
});

describe('waitlist admin actions — auth guard', () => {
	it('notify rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/waitlist/+page.server');
		await expectRejectedWith(
			actions.notify!(
				{ locals: { user: null }, request: new Request('http://x', { method: 'POST' }) } as any
			),
			401
		);
	});

	it('notify rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/waitlist/+page.server');
		await expectRejectedWith(
			actions.notify!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' })
				} as any
			),
			403
		);
	});

	it('deleteExpired (zero-arg action) rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/waitlist/+page.server');
		await expectRejectedWith(actions.deleteExpired!({ locals: { user: null } } as any), 401);
	});

	it('deleteExpired (zero-arg action) rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/waitlist/+page.server');
		await expectRejectedWith(
			actions.deleteExpired!({ locals: { user: staffUser } } as any),
			403
		);
	});
});

describe('emails admin actions — auth guard', () => {
	it('retry rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/emails/+page.server');
		await expectRejectedWith(
			actions.retry!(
				{ locals: { user: null }, request: new Request('http://x', { method: 'POST' }) } as any
			),
			401
		);
	});

	it('retry rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/emails/+page.server');
		await expectRejectedWith(
			actions.retry!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' })
				} as any
			),
			403
		);
	});
});

describe('webhooks admin actions — auth guard', () => {
	it('retry rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/webhooks/+page.server');
		await expectRejectedWith(
			actions.retry!(
				{ locals: { user: null }, request: new Request('http://x', { method: 'POST' }) } as any
			),
			401
		);
	});

	it('retry rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/webhooks/+page.server');
		await expectRejectedWith(
			actions.retry!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' })
				} as any
			),
			403
		);
	});
});

describe('settings admin actions — auth guard', () => {
	it('uploadHeroImage rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/settings/+page.server');
		await expectRejectedWith(
			actions.uploadHeroImage!(
				{ locals: { user: null }, request: new Request('http://x', { method: 'POST' }) } as any
			),
			401
		);
	});

	it('uploadHeroImage rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/settings/+page.server');
		await expectRejectedWith(
			actions.uploadHeroImage!(
				{
					locals: { user: staffUser },
					request: new Request('http://x', { method: 'POST' })
				} as any
			),
			403
		);
	});

	it('clearHeroImage (zero-arg action) rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/settings/+page.server');
		await expectRejectedWith(actions.clearHeroImage!({ locals: { user: null } } as any), 401);
	});

	it('clearHeroImage (zero-arg action) rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/settings/+page.server');
		await expectRejectedWith(
			actions.clearHeroImage!({ locals: { user: staffUser } } as any),
			403
		);
	});
});
