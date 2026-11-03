/**
 * Issue 061 — the pure half of the offline arrival replay: entries are
 * sent one by one, oldest first, with their client ids. Each answer
 * removes the entry (recorded, or a duplicate of the same attempt),
 * a refusal moves it to the conflicts list, and a network failure
 * stops the replay and keeps everything not yet confirmed. No
 * IndexedDB, no network — the caller decides what « send » means.
 */

/** One arrival made offline, waiting for the network. */
export interface ArrivalEntry {
	/** Issue 059: the id that makes a replay count once. */
	clientId: string;
	eventId: string;
	reservationId: string;
	/** The party's name, for the conflicts sheet; null when not visible. */
	guestName: string | null;
	guests: number;
	method: 'scan' | 'manual';
	/** ISO timestamp of when the door let the party in. */
	queuedAt: string;
}

/** An entry the server refused: kept on the phone until it is seen. */
export interface ArrivalConflict extends ArrivalEntry {
	/** The server's French refusal message. */
	error: string;
}

/** What a send came back with; a thrown error means the network failed. */
export type ArrivalSendResult = 'ok' | 'duplicate' | { conflict: string };

/**
 * Replays `entries` (already sorted oldest first) through `send`.
 * Returns what is still waiting (the unsent, and the one whose send
 * threw) and the conflicts the server answered with.
 */
export async function replayQueue(
	entries: ArrivalEntry[],
	send: (entry: ArrivalEntry) => Promise<ArrivalSendResult>
): Promise<{ remaining: ArrivalEntry[]; conflicts: ArrivalConflict[] }> {
	const remaining = [...entries];
	const conflicts: ArrivalConflict[] = [];
	for (let i = 0; i < remaining.length; i++) {
		const entry = remaining[i];
		let result: ArrivalSendResult;
		try {
			result = await send(entry);
		} catch {
			// The network failed: stop here, keep this entry and the rest.
			return { remaining, conflicts };
		}
		if (result === 'ok' || result === 'duplicate') {
			remaining.splice(i, 1);
			i--;
		} else {
			conflicts.push({ ...entry, error: result.conflict });
			remaining.splice(i, 1);
			i--;
		}
	}
	return { remaining, conflicts };
}
