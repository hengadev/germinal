// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTasksForUser = vi.hoisted(() => vi.fn());
const updateTaskStatus = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/services/tasks', () => ({ getTasksForUser, updateTaskStatus }));

import { PATCH } from '../../../src/routes/api/staff/tasks/[id]/status/+server';

const staffUser = { id: 'staff-1', email: 'staff@example.com', role: 'staff', createdAt: new Date() };

function patch(taskId: string, body: unknown) {
	return PATCH({
		locals: { user: staffUser },
		params: { id: taskId },
		request: new Request('http://x', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body),
		}),
	} as any);
}

describe('PATCH /api/staff/tasks/[id]/status', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getTasksForUser.mockResolvedValue([{ id: 'task-own' }]);
		updateTaskStatus.mockImplementation(async (id: string, status: string) => ({ id, status }));
	});

	it.each([{ status: 'archived' }, { status: '' }, { status: 42 }, {}, 'not json'])(
		'rejects %j with 400 before touching the database',
		async (body) => {
			const response = await patch('task-own', body);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toMatch(/pending, in_progress, done/);
			expect(getTasksForUser).not.toHaveBeenCalled();
			expect(updateTaskStatus).not.toHaveBeenCalled();
		}
	);

	it.each(['pending', 'in_progress', 'done'])('accepts %s for the caller’s own Task', async (status) => {
		const response = await patch('task-own', { status });

		expect(response.status).toBe(200);
		expect(updateTaskStatus).toHaveBeenCalledWith('task-own', status);
	});

	it('still answers 404 for a Task assigned to someone else', async () => {
		const response = await patch('task-other', { status: 'done' });

		expect(response.status).toBe(404);
		expect(updateTaskStatus).not.toHaveBeenCalled();
	});
});
