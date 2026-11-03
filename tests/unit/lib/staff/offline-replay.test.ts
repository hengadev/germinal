import { describe, expect, it } from 'vitest';
import { replayQueue, type ArrivalEntry } from '$lib/staff/offline/replay';

function entry(clientId: string, overrides: Partial<ArrivalEntry> = {}): ArrivalEntry {
	return {
		clientId,
		eventId: 'evt-1',
		reservationId: `res-${clientId}`,
		guestName: `Groupe ${clientId}`,
		guests: 2,
		method: 'scan',
		queuedAt: `2025-06-01T12:0${clientId}:00.000Z`,
		...overrides
	};
}

describe('replayQueue', () => {
	it('removes the entries the server records', async () => {
		const entries = [entry('1'), entry('2')];
		const { remaining, conflicts } = await replayQueue(entries, async () => 'ok');
		expect(remaining).toEqual([]);
		expect(conflicts).toEqual([]);
	});

	it('treats a duplicate (already recorded with the same client id) as a success', async () => {
		const { remaining, conflicts } = await replayQueue([entry('1')], async () => 'duplicate');
		expect(remaining).toEqual([]);
		expect(conflicts).toEqual([]);
	});

	it('moves a refusal to the conflicts and keeps replaying the rest', async () => {
		const entries = [entry('1'), entry('2'), entry('3')];
		const { remaining, conflicts } = await replayQueue(entries, async (e) =>
			e.clientId === '2' ? { conflict: 'Il ne reste que 1 personne attendue.' } : 'ok'
		);
		expect(remaining).toEqual([]);
		expect(conflicts).toEqual([
			{ ...entries[1], error: 'Il ne reste que 1 personne attendue.' }
		]);
	});

	it('stops at a network failure and keeps the entry and the ones behind it', async () => {
		const entries = [entry('1'), entry('2'), entry('3')];
		const { remaining, conflicts } = await replayQueue(entries, async (e) => {
			if (e.clientId === '2') throw new TypeError('Failed to fetch');
			return 'ok';
		});
		expect(remaining).toEqual([entries[1], entries[2]]);
		expect(conflicts).toEqual([]);
	});

	it('sends the entries oldest first', async () => {
		const order: string[] = [];
		await replayQueue([entry('1'), entry('2')], async (e) => {
			order.push(e.clientId);
			return 'ok';
		});
		expect(order).toEqual(['1', '2']);
	});
});
