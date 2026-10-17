// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

async function expectRejectedWith(promise: unknown, status: number) {
	try {
		await promise;
		expect.unreachable('expected action to throw');
	} catch (e) {
		expect(isHttpError(e)).toBe(true);
		if (isHttpError(e)) expect(e.status).toBe(status);
	}
}

const unauthEvent = () => ({
	locals: { user: null },
	request: new Request('http://x', { method: 'POST' }),
	params: { id: '1' },
	url: new URL('http://x'),
}) as any;

const staffUser = { id: '1', email: 'a@a.com', role: 'staff', createdAt: new Date() };

const staffEvent = () => ({
	locals: { user: staffUser },
	request: new Request('http://x', { method: 'POST' }),
	params: { id: '1' },
	url: new URL('http://x'),
}) as any;

describe('admin/events/+page.server actions — auth guard', () => {
	it('deleteEvent rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/+page.server');
		await expectRejectedWith(actions.deleteEvent!(staffEvent()), 403);
	});
});

describe('admin/events/new/+page.server actions — auth guard', () => {
	it('updateEvent (first save, creates the Draft) rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/new/+page.server');
		await expectRejectedWith(actions.updateEvent!(unauthEvent()), 401);
	});

	it('saveSeatings (first save, creates the Draft) rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/new/+page.server');
		await expectRejectedWith(actions.saveSeatings!(staffEvent()), 403);
	});
});

describe('admin/events/[id]/+page.server actions — auth guard', () => {
	it('updateEvent rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.updateEvent!(unauthEvent()), 401);
	});

	it('deletePhoto (media delete) rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.deletePhoto!(unauthEvent()), 401);
	});

	it('deletePhoto (media delete) rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.deletePhoto!(staffEvent()), 403);
	});

	it('saveSeatings rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.saveSeatings!(unauthEvent()), 401);
	});

	it('saveSeatings rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.saveSeatings!(staffEvent()), 403);
	});

	it('createPromoCode rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.createPromoCode!(unauthEvent()), 401);
	});

	it('deactivatePromoCode rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
		await expectRejectedWith(actions.deactivatePromoCode!(staffEvent()), 403);
	});
});
