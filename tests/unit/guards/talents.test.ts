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

const staffUser = { id: '1', email: 'a@a.com', role: 'staff', createdAt: new Date() };

describe('talents/[id]/+page.server.ts action — auth guard', () => {
	it('default rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/talents/[id]/+page.server');
		await expectRejectedWith(
			actions.default!({
				locals: { user: null },
				params: { id: '1' },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			401,
		);
	});

	it('default rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/talents/[id]/+page.server');
		await expectRejectedWith(
			actions.default!({
				locals: { user: staffUser },
				params: { id: '1' },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			403,
		);
	});
});

describe('talents/new/+page.server.ts action — auth guard', () => {
	it('default rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/talents/new/+page.server');
		await expectRejectedWith(
			actions.default!({
				locals: { user: null },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			401,
		);
	});

	it('default rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/talents/new/+page.server');
		await expectRejectedWith(
			actions.default!({
				locals: { user: staffUser },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			403,
		);
	});
});

describe('team/+page.server.ts actions — auth guard', () => {
	it('deleteTalent rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/team/+page.server');
		await expectRejectedWith(
			actions.deleteTalent!({
				locals: { user: null },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			401,
		);
	});

	it('deleteCategory rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/team/+page.server');
		await expectRejectedWith(
			actions.deleteCategory!({
				locals: { user: staffUser },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			403,
		);
	});

	it('createCategory rejects unauthenticated request', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/team/+page.server');
		await expectRejectedWith(
			actions.createCategory!({
				locals: { user: null },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			401,
		);
	});

	it('updateCategory rejects non-admin (staff) session', async () => {
		const { actions } = await import('../../../src/routes/(admin)/admin/team/+page.server');
		await expectRejectedWith(
			actions.updateCategory!({
				locals: { user: staffUser },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			403,
		);
	});
});
