// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
	EditorSaveController,
	formatSavedAgo,
	type EditorSaveOptions,
	type EditorSaveTimers,
	type SaveOutcome,
} from '$lib/utils/editor-save';

/** Timers the test moves by hand. */
function fakeTimers() {
	let time = 0;
	let nextId = 1;
	const pending = new Map<number, { at: number; callback: () => void }>();
	const timers: EditorSaveTimers = {
		setTimeout(callback, ms) {
			const id = nextId++;
			pending.set(id, { at: time + ms, callback });
			return id;
		},
		clearTimeout(handle) {
			pending.delete(handle as number);
		},
	};
	return {
		timers,
		now: () => time,
		advance(ms: number) {
			time += ms;
			for (const [id, timer] of [...pending].sort(([, a], [, b]) => a.at - b.at)) {
				if (timer.at > time) continue;
				pending.delete(id);
				timer.callback();
			}
		},
	};
}

/** A tab whose content is a string and whose saves the test settles. */
function fakeTab() {
	const submits: { sent: string; settle: (outcome: SaveOutcome) => void }[] = [];
	const tab = {
		value: 'saved',
		restored: 0,
		submits,
		serialize: () => tab.value,
		submit: () => new Promise<SaveOutcome>((resolve) => submits.push({ sent: tab.value, settle: resolve })),
		restore: () => {
			tab.value = 'saved';
			tab.restored++;
		},
		/** The Admin types `value`. */
		type(controller: EditorSaveController, id: string, value: string) {
			controller.touch(id);
			tab.value = value;
			controller.changed(id);
		},
	};
	return tab;
}

/** Let settled saves run their continuations. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: EditorSaveOptions = {}) {
	const clock = fakeTimers();
	const controller = new EditorSaveController({ timers: clock.timers, now: clock.now, ...options });
	return { clock, controller };
}

describe('EditorSaveController — draft mode', () => {
	it('saves a change after 2 s idle, not before', () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);

		tab.type(controller, 'essentiel', 'Dî');
		clock.advance(1500);
		tab.type(controller, 'essentiel', 'Dîner');
		clock.advance(1500);
		expect(tab.submits).toHaveLength(0);
		expect(controller.state('essentiel')).toBe('dirty');

		clock.advance(500);
		expect(tab.submits).toHaveLength(1);
		expect(tab.submits[0].sent).toBe('Dîner');
		expect(controller.state('essentiel')).toBe('saving');
	});

	it('saves at once when a field loses focus', () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);

		tab.type(controller, 'essentiel', 'Dîner');
		controller.blurred('essentiel');
		expect(tab.submits).toHaveLength(1);
		// The pending idle save does not run a second time.
		clock.advance(5000);
		expect(tab.submits).toHaveLength(1);
	});

	it('a blur with nothing changed saves nothing', () => {
		const { controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);
		controller.touch('essentiel');
		controller.blurred('essentiel');
		expect(tab.submits).toHaveLength(0);
	});

	it('never runs two saves of a tab at once, and queues one follow-up', async () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);

		tab.type(controller, 'essentiel', 'Dîner');
		controller.blurred('essentiel');
		tab.type(controller, 'essentiel', 'Dîner au jardin');
		tab.type(controller, 'essentiel', 'Dîner au jardin, Paris');
		controller.blurred('essentiel');
		clock.advance(5000);
		expect(tab.submits).toHaveLength(1);

		tab.submits[0].settle({ ok: true });
		await flush();
		expect(tab.submits).toHaveLength(2);
		expect(tab.submits[1].sent).toBe('Dîner au jardin, Paris');
		expect(controller.state('essentiel')).toBe('saving');

		tab.submits[1].settle({ ok: true });
		await flush();
		expect(tab.submits).toHaveLength(2);
		expect(controller.state('essentiel')).toBe('saved');
		expect(controller.isDirty()).toBe(false);
	});

	it('an explicit save during one in flight answers with the follow-up', async () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('lieu', tab);
		tab.type(controller, 'lieu', 'Paris');

		const first = controller.save('lieu');
		const second = controller.save('lieu');
		tab.submits[0].settle({ ok: true });
		await flush();
		expect(tab.submits).toHaveLength(2);
		tab.submits[1].settle({ ok: false, reason: 'failed' });
		expect(await second).toEqual({ ok: false, reason: 'failed' });
		expect(await first).toEqual({ ok: false, reason: 'failed' });
	});

	it('a refused save is invalid, keeps its changes and saves again when corrected', async () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		controller.register('tarifs', tab);

		tab.type(controller, 'tarifs', 'menu sans prix');
		clock.advance(2000);
		tab.submits[0].settle({ ok: false, reason: 'invalid', message: 'Indiquez un prix.' });
		await flush();
		expect(controller.state('tarifs')).toBe('invalid');
		expect(controller.snapshot().messages.tarifs).toBe('Indiquez un prix.');
		expect(controller.snapshot().status).toBe('invalid');
		expect(controller.isDirty()).toBe(true);

		tab.type(controller, 'tarifs', 'menu à 90 €');
		expect(controller.state('tarifs')).toBe('invalid');
		clock.advance(2000);
		expect(tab.submits).toHaveLength(2);
		tab.submits[1].settle({ ok: true });
		await flush();
		expect(controller.state('tarifs')).toBe('saved');
		expect(controller.snapshot().messages.tarifs).toBeUndefined();
	});

	it('a failed save offers a retry that saves it again', async () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		const other = fakeTab();
		controller.register('essentiel', tab);
		controller.register('lieu', other);

		tab.type(controller, 'essentiel', 'Dîner');
		clock.advance(2000);
		tab.submits[0].settle({ ok: false, reason: 'failed' });
		await flush();
		expect(controller.snapshot().status).toBe('failed');
		expect(controller.isDirty()).toBe(true);

		const retried = controller.retry();
		expect(tab.submits).toHaveLength(2);
		expect(other.submits).toHaveLength(0);
		tab.submits[1].settle({ ok: true });
		expect(await retried).toEqual([{ id: 'essentiel', outcome: { ok: true } }]);
		expect(controller.snapshot().status).toBe('saved');
	});

	it('a submit that throws is a failed save', async () => {
		const { controller } = setup({ autosave: false });
		controller.register('essentiel', {
			serialize: () => 'x',
			submit: () => Promise.reject(new Error('réseau')),
		});
		expect(await controller.save('essentiel')).toEqual({ ok: false, reason: 'failed', message: 'réseau' });
		expect(controller.state('essentiel')).toBe('failed');
	});

	it('a cancelled save keeps the tab modified', async () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Public');
		const saving = controller.save('essentiel');
		tab.submits[0].settle({ ok: false, reason: 'cancelled' });
		await saving;
		expect(controller.state('essentiel')).toBe('dirty');
	});

	it('records when a save last went through', async () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);
		expect(controller.snapshot().lastSavedAt).toBeNull();
		tab.type(controller, 'essentiel', 'Dîner');
		clock.advance(2000);
		clock.advance(1000);
		tab.submits[0].settle({ ok: true });
		await flush();
		expect(controller.snapshot().lastSavedAt).toBe(3000);
	});

	it('with autosave off, a change only marks the tab', () => {
		const { clock, controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		controller.blurred('essentiel');
		clock.advance(10_000);
		expect(tab.submits).toHaveLength(0);
		expect(controller.state('essentiel')).toBe('dirty');
	});

	it('with autosave off, a change during a save leaves the tab modified', async () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		const saving = controller.save('essentiel');
		tab.type(controller, 'essentiel', 'Dîner au jardin');
		tab.submits[0].settle({ ok: true });
		await saving;
		expect(tab.submits).toHaveLength(1);
		expect(controller.state('essentiel')).toBe('dirty');
		// Putting back what was saved is no change.
		tab.type(controller, 'essentiel', 'Dîner');
		expect(controller.state('essentiel')).toBe('clean');
	});
});

describe('EditorSaveController — published mode', () => {
	it('holds changes: nothing saves by itself', () => {
		const { clock, controller } = setup({ mode: 'published' });
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		controller.blurred('essentiel');
		clock.advance(10_000);
		expect(tab.submits).toHaveLength(0);
		expect(controller.state('essentiel')).toBe('dirty');
		expect(controller.snapshot().dirtyCount).toBe(1);
	});

	it('switching to published cancels a pending draft save', () => {
		const { clock, controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		controller.setMode('published');
		clock.advance(5000);
		expect(tab.submits).toHaveLength(0);
	});

	it('saveAll saves modified tabs one after the other, Seatings before pricing', async () => {
		const { controller } = setup({ mode: 'published' });
		const seatings = fakeTab();
		const pricing = fakeTab();
		const untouched = fakeTab();
		controller.register('dates-seances', seatings);
		controller.register('tarifs', pricing);
		controller.register('programme', untouched);
		pricing.type(controller, 'tarifs', 'menu');
		seatings.type(controller, 'dates-seances', 'séance');

		const all = controller.saveAll();
		expect(seatings.submits).toHaveLength(1);
		expect(pricing.submits).toHaveLength(0);
		seatings.submits[0].settle({ ok: true });
		await flush();
		expect(pricing.submits).toHaveLength(1);
		pricing.submits[0].settle({ ok: true });

		expect(await all).toEqual([
			{ id: 'dates-seances', outcome: { ok: true } },
			{ id: 'tarifs', outcome: { ok: true } },
		]);
		expect(untouched.submits).toHaveLength(0);
		expect(controller.isDirty()).toBe(false);
		expect(controller.snapshot().status).toBe('saved');
	});

	it('saveAll reports a partial failure and goes on with the other tabs', async () => {
		const { controller } = setup({ mode: 'published' });
		const seatings = fakeTab();
		const pricing = fakeTab();
		controller.register('dates-seances', seatings);
		controller.register('tarifs', pricing);
		seatings.type(controller, 'dates-seances', 'séance');
		pricing.type(controller, 'tarifs', 'menu');

		const all = controller.saveAll();
		seatings.submits[0].settle({ ok: false, reason: 'invalid', message: 'Capacité manquante' });
		await flush();
		pricing.submits[0].settle({ ok: true });
		expect(await all).toEqual([
			{ id: 'dates-seances', outcome: { ok: false, reason: 'invalid', message: 'Capacité manquante' } },
			{ id: 'tarifs', outcome: { ok: true } },
		]);
		expect(controller.state('dates-seances')).toBe('invalid');
		expect(controller.state('tarifs')).toBe('saved');
		expect(controller.snapshot().dirtyCount).toBe(1);
		expect(controller.isDirty()).toBe(true);
	});

	it('discardAll puts every modified tab back as saved', () => {
		const { controller } = setup({ mode: 'published' });
		const a = fakeTab();
		const b = fakeTab();
		const untouched = fakeTab();
		controller.register('essentiel', a);
		controller.register('lieu', b);
		controller.register('programme', untouched);
		a.type(controller, 'essentiel', 'Dîner');
		b.type(controller, 'lieu', 'Paris');

		controller.discardAll();
		expect(a.restored).toBe(1);
		expect(b.restored).toBe(1);
		expect(untouched.restored).toBe(0);
		expect(controller.isDirty()).toBe(false);
		expect(controller.snapshot().dirtyCount).toBe(0);
		expect(controller.state('essentiel')).toBe('clean');
	});
});

describe('EditorSaveController — isDirty (the leave guard)', () => {
	it('an untouched editor is never dirty', () => {
		const { controller } = setup();
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.value = 'set up on mount';
		expect(controller.isDirty()).toBe(false);
	});

	it('a tab touched but not changed is not dirty', () => {
		const { controller } = setup();
		controller.register('essentiel', fakeTab());
		controller.touch('essentiel');
		expect(controller.isDirty()).toBe(false);
	});

	it('keeps the first snapshot across later touches', () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		controller.touch('essentiel');
		expect(controller.isDirty()).toBe(true);
	});

	it('putting a field back as it was is not a change', () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		tab.type(controller, 'essentiel', 'saved');
		expect(controller.isDirty()).toBe(false);
		expect(controller.state('essentiel')).toBe('clean');
	});

	it('sees a change no input reported', () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		controller.register('visuels', tab);
		controller.touch('visuels');
		tab.value = 'uploaded';
		expect(controller.isDirty()).toBe(true);
		expect(controller.state('visuels')).toBe('dirty');
	});

	it('a save cleans that tab only, until it is edited again', async () => {
		const { controller } = setup({ autosave: false });
		const a = fakeTab();
		const b = fakeTab();
		controller.register('essentiel', a);
		controller.register('lieu', b);
		a.type(controller, 'essentiel', 'Dîner');
		b.type(controller, 'lieu', 'Paris');

		const saving = controller.save('essentiel');
		a.submits[0].settle({ ok: true });
		await saving;
		expect(controller.isDirty()).toBe(true);
		// The tab refreshing itself from the saved data is no edit.
		a.value = 'Dîner (EN generated)';
		expect(controller.state('essentiel')).toBe('saved');

		const savingB = controller.save('lieu');
		b.submits[0].settle({ ok: true });
		await savingB;
		expect(controller.isDirty()).toBe(false);

		a.type(controller, 'essentiel', 'Déjeuner');
		expect(controller.isDirty()).toBe(true);
	});

	it('an unregistered tab no longer counts', () => {
		const { controller } = setup({ autosave: false });
		const tab = fakeTab();
		const unregister = controller.register('essentiel', tab);
		tab.type(controller, 'essentiel', 'Dîner');
		unregister();
		expect(controller.isDirty()).toBe(false);
	});
});

describe('EditorSaveController — snapshot', () => {
	it('reports the most pressing status and notifies subscribers', async () => {
		const { controller } = setup({ autosave: false });
		const a = fakeTab();
		const b = fakeTab();
		controller.register('essentiel', a);
		controller.register('lieu', b);
		const statuses: string[] = [];
		controller.subscribe((snapshot) => statuses.push(snapshot.status));

		a.type(controller, 'essentiel', 'Dîner');
		b.type(controller, 'lieu', 'Paris');
		expect(controller.snapshot().dirtyCount).toBe(2);
		const saving = controller.save('essentiel');
		expect(controller.snapshot().status).toBe('saving');
		a.submits[0].settle({ ok: true });
		await saving;
		expect(controller.snapshot().status).toBe('dirty');
		const changes = statuses.filter((status, i) => status !== statuses[i - 1]);
		expect(changes).toEqual(['clean', 'dirty', 'saving', 'dirty']);
	});
});

describe('formatSavedAgo', () => {
	const minute = 60_000;
	it('says how long ago, in French', () => {
		expect(formatSavedAgo(0, 10_000)).toBe('à l’instant');
		expect(formatSavedAgo(0, 2 * minute)).toBe('il y a 2 min');
		expect(formatSavedAgo(0, 3 * 60 * minute)).toBe('il y a 3 h');
		expect(formatSavedAgo(0, 2 * 24 * 60 * minute)).toBe('il y a 2 j');
	});
});
