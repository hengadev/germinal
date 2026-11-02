/**
 * Issue 060 — the Day's snapshot on the phone, in IndexedDB: the parties
 * of one Event's current Day with their ticket codes hashed. Refreshed by
 * the Staff Event page while online, read by the Scanner while offline,
 * and cleared at sign-out. Plain indexedDB API, no dependency.
 */
import { markOffline, markOnline } from './online-state.svelte';

export interface SnapshotParty {
	id: string | null;
	guestName: string | null;
	quantity: number | null;
	arrived: number;
	balance: string | null;
	isComp: boolean;
	dietaryRequirements: string | null;
	/** SHA-256 hex of the ticket code — the code itself never leaves the server. */
	tokenHash: string;
}

export interface StoredSnapshot {
	eventId: string;
	day: string;
	takenAt: string;
	seatings: { id: string; startTime: string; parties: SnapshotParty[] }[];
}

const DB_NAME = 'germinal-staff';
const DB_VERSION = 2;
const STORE = 'day-snapshots';
export const QUEUE_STORE = 'arrival-queue';
export const CONFLICTS_STORE = 'arrival-conflicts';

export function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE, { keyPath: 'eventId' });
			}
			// Issue 061 : les arrivées en attente et leurs refus.
			for (const store of [QUEUE_STORE, CONFLICTS_STORE]) {
				if (!request.result.objectStoreNames.contains(store)) {
					request.result.createObjectStore(store, { keyPath: 'clientId' });
				}
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function withStore<T>(
	storeName: string,
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = run(db.transaction(storeName, mode).objectStore(storeName));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

/** Fetches the current Day's snapshot and stores it, alone in the store. */
export async function refreshSnapshot(eventId: string): Promise<StoredSnapshot | null> {
	try {
		const res = await fetch(`/staff/events/${eventId}/snapshot`, {
			headers: { accept: 'application/json' }
		});
		markOnline();
		if (!res.ok) return null;
		const snapshot = (await res.json()) as StoredSnapshot;
		await clearSnapshots();
		await withStore(STORE, 'readwrite', (store) => store.put({ ...snapshot, eventId }));
		return snapshot;
	} catch (error) {
		if (error instanceof TypeError) markOffline();
		return null;
	}
}

/** The stored snapshot of an Event, or null. */
export async function getSnapshot(eventId: string): Promise<StoredSnapshot | null> {
	try {
		return await withStore(STORE, 'readonly', (store) => store.get(eventId));
	} catch {
		return null;
	}
}

/** Drops every stored snapshot (other Events, other Days, everything). */
export async function clearSnapshots(): Promise<void> {
	try {
		await withStore(STORE, 'readwrite', (store) => store.clear());
	} catch {
		// The store may not exist yet — nothing to clear.
	}
}

/** Issue 061 : an arrival queued offline counts straight away in the
 *  Event's stored snapshot, so a scan just after it sees the new count. */
export async function applyArrivalToSnapshot(
	eventId: string,
	reservationId: string,
	guests: number
): Promise<void> {
	try {
		const snapshot = await withStore(STORE, 'readonly', (store) => store.get(eventId));
		if (!snapshot) return;
		let found = false;
		for (const seating of snapshot.seatings) {
			const party = seating.parties.find((party: SnapshotParty) => party.id === reservationId);
			if (party) {
				party.arrived += guests;
				found = true;
				break;
			}
		}
		if (found) {
			await withStore(STORE, 'readwrite', (store) => store.put(snapshot));
		}
	} catch {
		// Without a copy there is nothing to update.
	}
}

/** SHA-256 hex of a ticket code, with Web Crypto (over HTTPS, as the portal). */
export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/** Finds a party by hashed ticket code in an Event's stored snapshot. */
export async function findPartyByHash(
	eventId: string,
	tokenHash: string
): Promise<SnapshotParty | null> {
	const snapshot = await getSnapshot(eventId);
	if (!snapshot) return null;
	for (const seating of snapshot.seatings) {
		const party = seating.parties.find((party) => party.tokenHash === tokenHash);
		if (party) return party;
	}
	return null;
}
