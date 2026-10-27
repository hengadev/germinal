// @vitest-environment node
/**
 * Issue 012 (ADR 0010) — Publication saves through its own action.
 *
 * Visibility, Spotlight and Portfolio are set only by `updatePublication`,
 * with the same rules and messages as before: the Spotlight asks for a
 * Public Event (issue 032), the Portfolio for a last Seating that has
 * started (issue 044). The Essentiel text save (`updateEvent`) ignores
 * those fields, so saving the text — or any later autosave of it — can
 * never publish an Event.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateEvent = vi.hoisted(() => vi.fn());
const getEventById = vi.hoisted(() => vi.fn());
const lastSeatingStartOf = vi.hoisted(() => vi.fn());
const refusals = vi.hoisted(() => {
	class SpotlightRequiresPublicError extends Error {}
	class PortfolioRequiresOverEventError extends Error {}
	return { SpotlightRequiresPublicError, PortfolioRequiresOverEventError };
});

vi.mock('$lib/server/services/events', () => ({
	updateEvent,
	getEventById,
	SpotlightRequiresPublicError: refusals.SpotlightRequiresPublicError,
	PortfolioRequiresOverEventError: refusals.PortfolioRequiresOverEventError,
}));

vi.mock('$lib/server/services/event-access', () => ({ lastSeatingStartOf }));

// The route reads `env` at import time; dotenv never overrides a variable
// that is already set, so the database path is forced however the
// developer's .env is set up.
process.env.USE_MOCK_DATA = 'false';

async function loadActions() {
	vi.resetModules();
	return import('../../../src/routes/(admin)/admin/events/[id]/+page.server');
}

function post(actions: Awaited<ReturnType<typeof loadActions>>, name: string, fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return (actions.actions as any)[name]({
		request: new Request(`http://x/admin/events/event-1?/${name}`, { method: 'POST', body: form }),
		params: { id: 'event-1' },
		locals: { user: { id: 'admin-1', role: 'admin' } },
	});
}

beforeEach(async () => {
	vi.clearAllMocks();
	updateEvent.mockResolvedValue({});
	getEventById.mockResolvedValue(undefined);
	lastSeatingStartOf.mockResolvedValue(null);
});

describe('updatePublication', () => {
	it('saves the chosen Visibility, Spotlight and Portfolio through the Event service', async () => {
		const actions = await loadActions();
		lastSeatingStartOf.mockResolvedValue(new Date('2025-01-01T00:00:00Z'));

		const result = await post(actions, 'updatePublication', {
			visibility: 'public',
			isSpotlight: 'true',
			isPortfolio: 'true',
		});

		expect(result).toEqual({ success: expect.any(String) });
		expect(updateEvent).toHaveBeenCalledWith('event-1', {
			visibility: 'public',
			isSpotlight: true,
			isPortfolio: true,
		});
	});

	it.each(['draft', 'private'] as const)(
		'refuses the Spotlight on a %s Event, in French, without touching the Event',
		async (visibility) => {
			const actions = await loadActions();

			const result = await post(actions, 'updatePublication', { visibility, isSpotlight: 'true' });

			expect(result.status).toBe(400);
			expect(result.data.error).toMatch(/Seul un événement Public/);
			expect(updateEvent).not.toHaveBeenCalled();
		}
	);

	it.each([
		['has not started yet', new Date('2999-01-01T00:00:00Z')],
		['no Seating at all', null],
	])('refuses the Portfolio while the last Seating %s, in French', async (_, lastSeatingStart) => {
		const actions = await loadActions();
		lastSeatingStartOf.mockResolvedValue(lastSeatingStart);

		const result = await post(actions, 'updatePublication', {
			visibility: 'public',
			isPortfolio: 'true',
		});

		expect(result.status).toBe(400);
		expect(result.data.error).toMatch(/ne rejoint le Portfolio qu’une fois sa dernière séance commencée/);
		expect(updateEvent).not.toHaveBeenCalled();
	});

	it('refuses an unknown Visibility', async () => {
		const actions = await loadActions();

		const result = await post(actions, 'updatePublication', { visibility: 'hidden' });

		expect(result.status).toBe(400);
		expect(result.data.error).toBe('Visibilité invalide');
		expect(updateEvent).not.toHaveBeenCalled();
	});

	it.each([
		['SpotlightRequiresPublicError', new refusals.SpotlightRequiresPublicError(), /Seul un événement Public/],
		['PortfolioRequiresOverEventError', new refusals.PortfolioRequiresOverEventError(), /ne rejoint le Portfolio/],
	])(
		'answers the service’s own %s with the same French message',
		async (_, refusal, message) => {
			const actions = await loadActions();
			updateEvent.mockRejectedValueOnce(refusal);
			lastSeatingStartOf.mockResolvedValue(new Date('2025-01-01T00:00:00Z'));

			const result = await post(actions, 'updatePublication', {
				visibility: 'public',
				isPortfolio: 'true',
			});

			expect(result.status).toBe(400);
			expect(result.data.error).toMatch(message);
		}
	);
});

describe('updateEvent (the Essentiel text save)', () => {
	it('never changes Visibility, Spotlight or Portfolio, even if a stale form posts them', async () => {
		const actions = await loadActions();

		const result = await post(actions, 'updateEvent', {
			titleFr: 'Dîner',
			visibility: 'public',
			isSpotlight: 'true',
			isPortfolio: 'true',
		});

		expect(result).toEqual({ success: expect.any(String) });
		expect(updateEvent).toHaveBeenCalledTimes(1);
		const [id, fields] = updateEvent.mock.calls[0];
		expect(id).toBe('event-1');
		expect(fields).toMatchObject({ titleFr: 'Dîner' });
		expect(fields).not.toHaveProperty('visibility');
		expect(fields).not.toHaveProperty('isSpotlight');
		expect(fields).not.toHaveProperty('isPortfolio');
	});
});
