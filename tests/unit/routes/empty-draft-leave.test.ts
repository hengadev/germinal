// @vitest-environment node
/**
 * Issue 015 (ADR 0010) — leaving the editor of an empty Draft deletes it.
 * The endpoint is Admin-only and delegates emptiness to the check the
 * sweep job shares; mock mode answers from the mock data, the editor's
 * beacon sending nothing but the Event it leaves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteEmptyDraft = vi.hoisted(() => vi.fn());
const mockMode = vi.hoisted(() => ({ value: false }));
const mockEvents = vi.hoisted(() => [
	// The Draft « Nouvel événement » creates: nothing filled in (the
	// missing text fields read as null, as in the real mock rows).
	{ id: 'draft-empty', visibility: 'draft', timeZone: 'Europe/Paris', coverMediaId: null, coverVideoId: null, media: [] },
	// A Draft with anything filled in, and an empty published Event.
	{ id: 'draft-titled', visibility: 'draft', timeZone: 'Europe/Paris', coverMediaId: null, coverVideoId: null, media: [], titleFr: 'Une soirée au salon' },
	{ id: 'public-empty', visibility: 'public', timeZone: 'Europe/Paris', coverMediaId: null, coverVideoId: null, media: [] },
]);

vi.mock('$lib/server/services/event-draft', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/services/event-draft')>()),
	deleteEmptyDraft,
}));

vi.mock('$lib/server/env', () => ({
	env: {
		get USE_MOCK_DATA() {
			return mockMode.value;
		},
	},
}));

vi.mock('$lib/mock-data', () => ({
	MOCK_EVENTS: mockEvents,
	MOCK_SESSIONS: [],
}));

async function loadEndpoint() {
	vi.resetModules();
	return import('../../../src/routes/(admin)/admin/events/[id]/leave/+server');
}

const ADMIN = { user: { id: 'admin-1', role: 'admin' } };

function post(endpoint: Awaited<ReturnType<typeof loadEndpoint>>, id: string, locals: object) {
	return endpoint.POST({
		params: { id },
		locals,
	} as never) as Promise<Response>;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockMode.value = false;
	mockEvents.length = 0;
	mockEvents.push(
		{ id: 'draft-empty', visibility: 'draft', timeZone: 'Europe/Paris', coverMediaId: null, coverVideoId: null, media: [] },
		{ id: 'draft-titled', visibility: 'draft', timeZone: 'Europe/Paris', coverMediaId: null, coverVideoId: null, media: [], titleFr: 'Une soirée au salon' },
		{ id: 'public-empty', visibility: 'public', timeZone: 'Europe/Paris', coverMediaId: null, coverVideoId: null, media: [] }
	);
});

describe('the empty-Draft leave endpoint', () => {
	it('requires an Admin', async () => {
		const endpoint = await loadEndpoint();
		await expect(post(endpoint, 'draft-empty', { user: null })).rejects.toMatchObject({ status: 401 });
		await expect(
			post(endpoint, 'draft-empty', { user: { id: 'staff-1', role: 'staff' } })
		).rejects.toMatchObject({ status: 403 });
		expect(deleteEmptyDraft).not.toHaveBeenCalled();
	});

	it('deletes an empty Draft through the check the sweep job shares', async () => {
		deleteEmptyDraft.mockResolvedValue(true);
		const endpoint = await loadEndpoint();

		const response = await post(endpoint, 'draft-empty', ADMIN);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ deleted: true });
		expect(deleteEmptyDraft).toHaveBeenCalledWith('draft-empty');
	});

	it('reports a Draft that is not empty, without failing', async () => {
		deleteEmptyDraft.mockResolvedValue(false);
		const endpoint = await loadEndpoint();

		const response = await post(endpoint, 'draft-titled', ADMIN);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ deleted: false });
	});

	it('answers a failed check without throwing the beacon away', async () => {
		deleteEmptyDraft.mockRejectedValue(new Error('database unreachable'));
		const endpoint = await loadEndpoint();

		const response = await post(endpoint, 'draft-empty', ADMIN);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ deleted: false });
	});
});

describe('the empty-Draft leave endpoint in mock mode', () => {
	beforeEach(() => {
		mockMode.value = true;
	});

	it('removes an empty Draft from the mock list', async () => {
		const endpoint = await loadEndpoint();

		const response = await post(endpoint, 'draft-empty', ADMIN);

		expect(await response.json()).toEqual({ deleted: true });
		expect(mockEvents.map((event) => event.id)).toEqual(['draft-titled', 'public-empty']);
	});

	it('keeps a Draft with anything filled in, and a published Event', async () => {
		const endpoint = await loadEndpoint();

		expect(await (await post(endpoint, 'draft-titled', ADMIN)).json()).toEqual({ deleted: false });
		expect(await (await post(endpoint, 'public-empty', ADMIN)).json()).toEqual({ deleted: false });
		expect(mockEvents).toHaveLength(3);
	});

	it('answers an unknown Event with nothing deleted', async () => {
		const endpoint = await loadEndpoint();

		expect(await (await post(endpoint, 'draft-none', ADMIN)).json()).toEqual({ deleted: false });
	});
});
