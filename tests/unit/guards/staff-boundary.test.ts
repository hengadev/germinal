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

describe('team-management and task-assignment admin APIs — staff is no longer permitted', () => {
	// --- Team-management endpoints (create/deactivate/reset-password/generate-password) ---

	it('team staff list (GET /api/admin/team/staff) rejects a staff-role session (was previously allowed)', async () => {
		const { GET } = await import('../../../src/routes/api/admin/team/staff/+server');
		await expectRejectedWith(GET!({ locals: { user: staffUser } } as any), 403);
	});

	it('team staff create (POST /api/admin/team/staff) rejects a staff-role session (was previously allowed)', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/staff/+server');
		await expectRejectedWith(
			POST!({ locals: { user: staffUser }, request: new Request('http://x', { method: 'POST' }) } as any),
			403,
		);
	});

	it('staff deactivation (POST /api/admin/team/staff/deactivate) rejects a staff-role session', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/staff/deactivate/+server');
		await expectRejectedWith(
			POST!({ locals: { user: staffUser }, request: new Request('http://x', { method: 'POST' }) } as any),
			403,
		);
	});

	it('generate-password (GET /api/admin/team/staff/generate-password) rejects a staff-role session', async () => {
		const { GET } = await import('../../../src/routes/api/admin/team/staff/generate-password/+server');
		await expectRejectedWith(GET!({ locals: { user: staffUser } } as any), 403);
	});

	it('reset-password (POST /api/admin/team/staff/reset-password) rejects a staff-role session', async () => {
		const { POST } = await import('../../../src/routes/api/admin/team/staff/reset-password/+server');
		await expectRejectedWith(
			POST!({ locals: { user: staffUser }, request: new Request('http://x', { method: 'POST' }) } as any),
			403,
		);
	});

	// --- Task-management endpoints ---

	it('task creation (POST /api/admin/tasks) rejects a staff-role session (was previously allowed)', async () => {
		const { POST } = await import('../../../src/routes/api/admin/tasks/+server');
		await expectRejectedWith(
			POST!({ locals: { user: staffUser }, request: new Request('http://x', { method: 'POST' }) } as any),
			403,
		);
	});

	it('task update (PUT /api/admin/tasks/[id]) rejects a staff-role session', async () => {
		const { PUT } = await import('../../../src/routes/api/admin/tasks/[id]/+server');
		await expectRejectedWith(
			PUT!(
				{
					locals: { user: staffUser },
					params: { id: 'task-1' },
					request: new Request('http://x', { method: 'PUT' }),
				} as any,
			),
			403,
		);
	});

	it('task deletion (DELETE /api/admin/tasks/[id]) rejects a staff-role session', async () => {
		const { DELETE } = await import('../../../src/routes/api/admin/tasks/[id]/+server');
		await expectRejectedWith(
			DELETE!({ locals: { user: staffUser }, params: { id: 'task-1' } } as any),
			403,
		);
	});

	it('event tasks listing (GET /api/admin/events/[id]/tasks) rejects a staff-role session', async () => {
		const { GET } = await import('../../../src/routes/api/admin/events/[id]/tasks/+server');
		await expectRejectedWith(
			GET!({ locals: { user: staffUser }, params: { id: 'event-1' } } as any),
			403,
		);
	});

	// --- Event-Staff assignment endpoints ---

	it('event staff assignment (POST /api/admin/events/[id]/staff) rejects a staff-role session', async () => {
		const { POST } = await import('../../../src/routes/api/admin/events/[id]/staff/+server');
		await expectRejectedWith(
			POST!(
				{
					locals: { user: staffUser },
					params: { id: 'event-1' },
					request: new Request('http://x', { method: 'POST' }),
				} as any,
			),
			403,
		);
	});

	it('event staff removal (DELETE /api/admin/events/[id]/staff/[userId]) rejects a staff-role session', async () => {
		const { DELETE } = await import('../../../src/routes/api/admin/events/[id]/staff/[userId]/+server');
		await expectRejectedWith(
			DELETE!({ locals: { user: staffUser }, params: { id: 'event-1', userId: 'user-1' } } as any),
			403,
		);
	});

	// --- Unauthenticated ---

	it('unauthenticated request is still rejected with 401', async () => {
		const { GET } = await import('../../../src/routes/api/admin/team/staff/+server');
		await expectRejectedWith(GET!({ locals: { user: null } } as any), 401);
	});
});
