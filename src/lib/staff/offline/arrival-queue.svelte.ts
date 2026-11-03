/**
 * Issue 061 — the offline arrival queue on the phone: entries wait in
 * IndexedDB ('arrival-queue'), the server's refusals in
 * 'arrival-conflicts', and the banner reads the counts from here.
 * Both stores are cleared at sign-out.
 */
import {
	CONFLICTS_STORE,
	QUEUE_STORE,
	withStore
} from './snapshot-store';
import type { ArrivalConflict, ArrivalEntry } from './replay';
import { browser } from '$app/environment';

/** What the banner reads: how many entries wait, how many to verify. */
export const queueState = $state({
	pending: 0,
	sending: false,
	conflicts: [] as ArrivalConflict[]
});

/** Re-reads both stores into `queueState` (nothing offline to read → 0). */
export async function refreshQueueState(): Promise<void> {
	try {
		const entries = (await withStore<ArrivalEntry[]>(QUEUE_STORE, 'readonly', (store) =>
			store.getAll()
		)) as ArrivalEntry[];
		const conflicts = (await withStore<ArrivalConflict[]>(
			CONFLICTS_STORE,
			'readonly',
			(store) => store.getAll()
		)) as ArrivalConflict[];
		queueState.pending = entries.length;
		queueState.conflicts = conflicts.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
	} catch {
		queueState.pending = 0;
		queueState.conflicts = [];
	}
}

/** Queues one arrival, oldest first is just the insert order. */
export async function enqueueArrival(entry: ArrivalEntry): Promise<void> {
	await withStore(QUEUE_STORE, 'readwrite', (store) => store.put(entry));
	queueState.pending += 1;
}

/** The entries waiting, oldest first. */
export async function getArrivalQueue(): Promise<ArrivalEntry[]> {
	try {
		const entries = (await withStore<ArrivalEntry[]>(QUEUE_STORE, 'readonly', (store) =>
			store.getAll()
		)) as ArrivalEntry[];
		return entries.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
	} catch {
		return [];
	}
}

/** After a replay: the entries the server answered (recorded,
 *  duplicate or refused) leave the queue, the refusals are kept. */
export async function commitReplay(
	done: ArrivalEntry[],
	conflicts: ArrivalConflict[]
): Promise<void> {
	for (const entry of done) {
		await withStore(QUEUE_STORE, 'readwrite', (store) => store.delete(entry.clientId));
	}
	for (const conflict of conflicts) {
		await withStore(CONFLICTS_STORE, 'readwrite', (store) => store.put(conflict));
	}
	await refreshQueueState();
}

/** « Vu » : the door has read the refusal, drop it from the phone. */
export async function dismissConflict(clientId: string): Promise<void> {
	await withStore(CONFLICTS_STORE, 'readwrite', (store) => store.delete(clientId));
	await refreshQueueState();
}

/** Sign-out: the queue and the conflicts never survive the session. */
export async function clearArrivalData(): Promise<void> {
	try {
		await withStore(QUEUE_STORE, 'readwrite', (store) => store.clear());
		await withStore(CONFLICTS_STORE, 'readwrite', (store) => store.clear());
	} catch {
		// The stores may not exist yet — nothing to clear.
	}
	queueState.pending = 0;
	queueState.sending = false;
	queueState.conflicts = [];
}

if (browser) {
	refreshQueueState();
}
