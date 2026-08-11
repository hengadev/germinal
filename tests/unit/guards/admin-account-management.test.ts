// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

async function expectRejectedWith(promise: unknown, status: number) {
	try {
		await promise;
		expect.unreachable('expected handler to throw');
	} catch (e) {
		expect(isHttpError(e)).toBe(true);
		if (isHttpError(e)) expect(e.status).toBe(status);
	}
}

const staffUser = { id: '1', email: 'a@a.com', role: 'staff', createdAt: new Date() };
const adminUser = { id: 'admin-1', email: 'admin@a.com', role: 'admin', createdAt: new Date() };

describe('admin account management APIs — auth guard', () => {
	it('admin list (GET /api/admin/team/admin) rejects unauthenticated request', async () => {
		const { GET } = await import('../../../src/routes/api/admin/team/admin/+server');
		await expectRejectedWith(GET!({ locals: { user: null } } as any), 401);
	});

	it('admin list (GET /api/admin/team/admin) rejects a staff-role session', async () => {
		const { GET } = await import('../../../src/routes/api/admin/team/admin/+server');
		await expectRejectedWith(GET!({ locals: { user: staffUser } } as any), 403);
	});

	it('admin create (POST /api/admin/team/admin) rejects unauthenticated request', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/admin/+server');
		await expectRejectedWith(
			POST!({
				locals: { user: null },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			401,
		);
	});

	it('admin create (POST /api/admin/team/admin) rejects a staff-role session', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/admin/+server');
		await expectRejectedWith(
			POST!({
				locals: { user: staffUser },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			403,
		);
	});

	it('admin deactivation (POST /api/admin/team/admin/deactivate) rejects unauthenticated request', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/admin/deactivate/+server');
		await expectRejectedWith(
			POST!({
				locals: { user: null },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			401,
		);
	});

	it('admin deactivation (POST /api/admin/team/admin/deactivate) rejects a staff-role session', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/admin/deactivate/+server');
		await expectRejectedWith(
			POST!({
				locals: { user: staffUser },
				request: new Request('http://x', { method: 'POST' }),
			} as any),
			403,
		);
	});
});

describe('admin self-deactivation guard (defense in depth)', () => {
	it('rejects an admin attempting to deactivate their own account with a 400, before ever touching the database', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/admin/deactivate/+server');

		const formData = new FormData();
		formData.append('adminId', adminUser.id);

		// If this guard didn't run before the DB lookup, this call would throw an
		// ECONNREFUSED (no live database in this test environment) instead of
		// resolving with a 400 — so a passing test also proves the guard is checked
		// first, not just that it eventually rejects.
		const response = await POST!({
			locals: { user: adminUser },
			request: new Request('http://x', { method: 'POST', body: formData }),
		} as any);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toMatch(/cannot deactivate your own account/i);
	});

	it('does not trip the self-deactivation guard when the target id differs from the current admin', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/admin/deactivate/+server');

		const formData = new FormData();
		formData.append('adminId', 'some-other-admin-id');

		// Past the self-guard, the handler proceeds to a DB lookup which has no live
		// database in this test environment — so it should reject with a 500, not the
		// 400 self-deactivation error. This confirms the guard is scoped to the
		// current user's own id and doesn't over-block deactivating other admins.
		const response = await POST!({
			locals: { user: adminUser },
			request: new Request('http://x', { method: 'POST', body: formData }),
		} as any);

		expect(response.status).not.toBe(400);
	});
});
