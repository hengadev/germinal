/**
 * The Event editor's save controller (ADR 0010, issue 016).
 *
 * Owns each tab's save state and replaces the leave guard of issue 037.
 * A tab registers a `serialize()` (what it would save, as a comparable
 * string) and a `submit()` (save it, answer how it went). The controller
 * never touches the DOM or SvelteKit: clock and timers are injected, so it
 * runs under fake timers.
 *
 * Unsaved changes are found by comparing snapshots, as the leave guard
 * did: a tab's baseline is taken lazily, on the Admin's first interaction
 * (`touch`), so whatever a tab sets up on mount never counts as an edit.
 * A successful save forgets the baseline: the tab is clean until touched
 * and changed again. Editing a field then putting it back is not a change.
 *
 * Two modes:
 * - `draft`: with autosave on, a change saves the tab after `debounceMs`
 *   idle, a blur saves it at once. Never two saves in flight per tab: a
 *   save asked for during one runs once it is over. A tab registered with
 *   `autosave: false` (Seatings, pricing) only ever saves when asked.
 * - `published`: changes only mark the tab; `saveAll()` saves every
 *   modified tab in registration order (Seatings before pricing) and
 *   `discardAll()` puts every tab back as saved.
 */

export type TabSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'invalid' | 'failed';
export type EditorSaveMode = 'draft' | 'published';

/** How a tab's `submit()` went. `cancelled`: nothing was sent (a
 * confirmation was asked first, say); the tab keeps its changes. */
export type SaveOutcome =
	| { ok: true }
	| { ok: false; reason: 'invalid' | 'failed' | 'cancelled'; message?: string };

export interface EditorTab {
	/** What the tab would save, comparable as a string. */
	serialize(): string;
	/** Save the tab's whole content as one unit. */
	submit(): Promise<SaveOutcome>;
	/** Put the tab back as it was saved (published mode's « Annuler »). */
	restore?(): void;
}

export interface EditorSaveTimers {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface EditorSaveOptions {
	mode?: EditorSaveMode;
	/** Draft mode saves by itself only when this is on. */
	autosave?: boolean;
	/** Idle time before a draft change is saved. */
	debounceMs?: number;
	now?: () => number;
	timers?: EditorSaveTimers;
}

export interface EditorSaveSnapshot {
	mode: EditorSaveMode;
	/** The editor's one status, the most pressing of its tabs'. */
	status: TabSaveState;
	/** When a save last went through (ms since epoch), if any did. */
	lastSavedAt: number | null;
	/** Tabs holding unsaved changes. */
	dirtyCount: number;
	tabs: Record<string, TabSaveState>;
	/** The last refusal or failure, per tab. */
	messages: Record<string, string>;
}

export interface RegisterOptions {
	/** Whether this tab saves itself in draft mode (default: yes). */
	autosave?: boolean;
}

export interface TabSaveResult {
	id: string;
	outcome: SaveOutcome;
}

interface TabEntry {
	handle: EditorTab;
	/** Saves itself in draft mode, when the controller's autosave is on. */
	autosave: boolean;
	state: TabSaveState;
	/** The tab as last saved, taken on first touch; null until then. */
	baseline: string | null;
	/** The serialization last seen, to tell a real change from a re-check. */
	lastSeen: string | null;
	timer: unknown;
	inFlight: Promise<SaveOutcome> | null;
	/** A save was asked for while one was in flight. */
	queued: boolean;
	/** The Admin changed the tab while it was being saved. */
	editedDuringSave: boolean;
	message?: string;
}

/** States that hold changes not yet stored. */
const UNSAVED: ReadonlySet<TabSaveState> = new Set(['dirty', 'saving', 'invalid', 'failed']);
/** The overall status is the first of these any tab is in. */
const STATUS_PRIORITY: TabSaveState[] = ['saving', 'failed', 'invalid', 'dirty', 'saved', 'clean'];

const DEFAULT_TIMERS: EditorSaveTimers = {
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class EditorSaveController {
	private tabs = new Map<string, TabEntry>();
	private listeners = new Set<(snapshot: EditorSaveSnapshot) => void>();
	private mode: EditorSaveMode;
	private autosave: boolean;
	private readonly debounceMs: number;
	private readonly now: () => number;
	private readonly timers: EditorSaveTimers;
	private lastSavedAt: number | null = null;

	constructor(options: EditorSaveOptions = {}) {
		this.mode = options.mode ?? 'draft';
		this.autosave = options.autosave ?? true;
		this.debounceMs = options.debounceMs ?? 2000;
		this.now = options.now ?? (() => Date.now());
		this.timers = options.timers ?? DEFAULT_TIMERS;
	}

	// ---- Registration and settings ------------------------------------------

	/** Add a tab; returns its unregistration. Order matters for `saveAll`. */
	register(id: string, handle: EditorTab, options: RegisterOptions = {}): () => void {
		this.tabs.set(id, { handle, autosave: options.autosave ?? true, state: 'clean', baseline: null, lastSeen: null, timer: null, inFlight: null, queued: false, editedDuringSave: false });
		this.emit();
		return () => {
			const entry = this.tabs.get(id);
			if (entry?.handle !== handle) return;
			this.cancelTimer(entry);
			this.tabs.delete(id);
			this.emit();
		};
	}

	has(id: string): boolean {
		return this.tabs.has(id);
	}

	setMode(mode: EditorSaveMode): void {
		if (mode === this.mode) return;
		this.mode = mode;
		// Held edits never save themselves.
		if (mode === 'published') for (const entry of this.tabs.values()) this.cancelTimer(entry);
		this.emit();
	}

	setAutosave(on: boolean): void {
		this.autosave = on;
		if (!on) for (const entry of this.tabs.values()) this.cancelTimer(entry);
	}

	subscribe(listener: (snapshot: EditorSaveSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => this.listeners.delete(listener);
	}

	// ---- What the Admin does --------------------------------------------------

	/** The Admin is about to interact with tab `id`: remember it, once. */
	touch(id: string): void {
		const entry = this.tabs.get(id);
		if (!entry || entry.baseline !== null) return;
		entry.baseline = entry.handle.serialize();
		entry.lastSeen = entry.baseline;
	}

	/** The Admin may have changed tab `id`: compare it with its baseline. */
	changed(id: string): void {
		this.check(id, true);
	}

	/**
	 * Re-check every touched tab, for changes no input event reports (an
	 * upload finishing). A tab being saved is left alone: it may be
	 * refreshing itself from the saved data.
	 */
	refresh(): void {
		for (const id of this.tabs.keys()) this.check(id, false);
	}

	private check(id: string, byAdmin: boolean): void {
		const entry = this.tabs.get(id);
		if (!entry || entry.baseline === null) return;
		if (entry.state === 'saving') {
			if (!byAdmin) return;
			const current = entry.handle.serialize();
			if (current === entry.lastSeen) return;
			entry.lastSeen = current;
			entry.editedDuringSave = true;
			// A draft saves again once the save in flight is over.
			if (this.autosaves(entry)) entry.queued = true;
			return;
		}
		const current = entry.handle.serialize();
		if (current === entry.lastSeen) return;
		entry.lastSeen = current;

		if (current === entry.baseline) {
			this.cancelTimer(entry);
			entry.state = 'clean';
			entry.message = undefined;
		} else {
			// A refused or failed tab stays so until it is saved again.
			if (entry.state !== 'invalid' && entry.state !== 'failed') entry.state = 'dirty';
			if (this.autosaves(entry)) this.schedule(id, entry);
		}
		this.emit();
	}

	/** A field of tab `id` lost focus: a draft saves it at once. */
	blurred(id: string): void {
		const entry = this.tabs.get(id);
		if (!entry || !this.autosaves(entry)) return;
		this.changed(id);
		// A change waiting for its idle time goes now.
		if (entry.timer !== null) void this.save(id);
	}

	/**
	 * Save tab `id` now (its save button, a retry, an autosave). During a
	 * save already in flight, one more is queued; the answer is the last
	 * save's.
	 */
	save(id: string): Promise<SaveOutcome> {
		const entry = this.tabs.get(id);
		if (!entry) return Promise.resolve({ ok: false, reason: 'failed', message: 'Onglet inconnu' });
		this.cancelTimer(entry);
		if (entry.inFlight) {
			entry.queued = true;
			return entry.inFlight;
		}
		return this.run(id, entry);
	}

	/**
	 * Save now every change still waiting for its idle time (the Admin is
	 * leaving the page or the editor).
	 */
	flush(): void {
		for (const [id, entry] of this.tabs) if (entry.timer !== null) void this.save(id);
	}

	/** Resolves once no save is in flight, follow-ups included. */
	async idle(): Promise<void> {
		for (;;) {
			const flights = [...this.tabs.values()].map((entry) => entry.inFlight).filter((flight) => flight !== null);
			if (flights.length === 0) return;
			await Promise.allSettled(flights);
		}
	}

	/** Save again every tab whose save failed. */
	retry(): Promise<TabSaveResult[]> {
		return this.saveEach((entry) => entry.state === 'failed');
	}

	/** Save every tab holding changes, one after the other, in order. */
	saveAll(): Promise<TabSaveResult[]> {
		this.refresh();
		return this.saveEach((entry) => entry.state === 'dirty' || entry.state === 'invalid' || entry.state === 'failed');
	}

	/** Put every tab holding changes back as it was saved. */
	discardAll(): void {
		for (const entry of this.tabs.values()) {
			if (!UNSAVED.has(entry.state) || entry.state === 'saving') continue;
			this.cancelTimer(entry);
			entry.handle.restore?.();
			entry.baseline = null;
			entry.lastSeen = null;
			entry.state = 'clean';
			entry.message = undefined;
		}
		this.emit();
	}

	// ---- What the editor reads -------------------------------------------------

	state(id: string): TabSaveState | undefined {
		return this.tabs.get(id)?.state;
	}

	/** Whether leaving now would lose something (the leave guard). */
	isDirty(): boolean {
		this.refresh();
		for (const entry of this.tabs.values()) if (UNSAVED.has(entry.state)) return true;
		return false;
	}

	snapshot(): EditorSaveSnapshot {
		const tabs: Record<string, TabSaveState> = {};
		const messages: Record<string, string> = {};
		let dirtyCount = 0;
		for (const [id, entry] of this.tabs) {
			tabs[id] = entry.state;
			if (entry.message) messages[id] = entry.message;
			if (UNSAVED.has(entry.state)) dirtyCount++;
		}
		const states = new Set(Object.values(tabs));
		const status = STATUS_PRIORITY.find((state) => states.has(state)) ?? 'clean';
		return { mode: this.mode, status, lastSavedAt: this.lastSavedAt, dirtyCount, tabs, messages };
	}

	// ---- Internals -------------------------------------------------------------

	private autosaves(entry: TabEntry): boolean {
		return this.mode === 'draft' && this.autosave && entry.autosave;
	}

	private schedule(id: string, entry: TabEntry): void {
		this.cancelTimer(entry);
		entry.timer = this.timers.setTimeout(() => {
			entry.timer = null;
			void this.save(id);
		}, this.debounceMs);
	}

	private cancelTimer(entry: TabEntry): void {
		if (entry.timer === null) return;
		this.timers.clearTimeout(entry.timer);
		entry.timer = null;
	}

	private async saveEach(pick: (entry: TabEntry) => boolean): Promise<TabSaveResult[]> {
		const ids = [...this.tabs].filter(([, entry]) => pick(entry)).map(([id]) => id);
		const results: TabSaveResult[] = [];
		for (const id of ids) results.push({ id, outcome: await this.save(id) });
		return results;
	}

	private run(id: string, entry: TabEntry): Promise<SaveOutcome> {
		entry.queued = false;
		entry.editedDuringSave = false;
		entry.state = 'saving';
		entry.message = undefined;
		// What is being saved: the next baseline if nothing changes meanwhile.
		const sent = entry.handle.serialize();
		entry.lastSeen = sent;
		this.emit();

		const flight = (async (): Promise<SaveOutcome> => {
			let outcome: SaveOutcome;
			try {
				outcome = await entry.handle.submit();
			} catch (error) {
				outcome = { ok: false, reason: 'failed', message: error instanceof Error ? error.message : undefined };
			}
			if (this.tabs.get(id) !== entry) return outcome;
			entry.inFlight = null;

			if (outcome.ok) {
				this.lastSavedAt = this.now();
				if (entry.editedDuringSave) {
					// Changed during the save: what was sent is the new baseline.
					entry.baseline = sent;
					entry.lastSeen = null;
					entry.state = 'dirty';
				} else {
					// Clean until touched again: the tab may refresh itself
					// from the saved data (generated English) without that
					// counting as an edit.
					entry.baseline = null;
					entry.lastSeen = null;
					entry.state = 'saved';
				}
			} else if (outcome.reason === 'cancelled') {
				entry.state = entry.baseline !== null && entry.handle.serialize() === entry.baseline ? 'clean' : 'dirty';
			} else {
				entry.state = outcome.reason;
				entry.message = outcome.message;
			}

			if (entry.queued && (outcome.ok || outcome.reason === 'cancelled')) {
				this.emit();
				return this.run(id, entry);
			}
			entry.queued = false;
			this.emit();
			return outcome;
		})();
		entry.inFlight = flight;
		return flight;
	}

	private emit(): void {
		if (this.listeners.size === 0) return;
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
}

/** « il y a 2 min »: how long ago `savedAt` was, for the save status. */
export function formatSavedAgo(savedAt: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
	if (seconds < 45) return 'à l’instant';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `il y a ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `il y a ${hours} h`;
	const days = Math.round(hours / 24);
	return `il y a ${days} j`;
}
