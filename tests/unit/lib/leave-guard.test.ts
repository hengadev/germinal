import { describe, it, expect, afterEach } from 'vitest';
import { LeaveGuard, serializeForm, announceSaved, EDITOR_SAVED_EVENT } from '$lib/utils/leave-guard';

function makeForm(html: string): HTMLFormElement {
	const form = document.createElement('form');
	form.innerHTML = html;
	document.body.appendChild(form);
	return form;
}

function input(form: HTMLFormElement, name: string): HTMLInputElement {
	return form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('serializeForm', () => {
	it('reflects what the form would post', () => {
		const form = makeForm('<input name="a" value="1"><input type="checkbox" name="b">');
		const before = serializeForm(form);
		input(form, 'b').checked = true;
		expect(serializeForm(form)).not.toBe(before);
	});
});

describe('LeaveGuard', () => {
	it('an untouched editor is never dirty', () => {
		const guard = new LeaveGuard();
		makeForm('<input name="title" value="">');
		expect(guard.isDirty()).toBe(false);
	});

	it('a form touched but not changed is not dirty', () => {
		const guard = new LeaveGuard();
		const form = makeForm('<input name="title" value="Dîner">');
		guard.touch(form);
		expect(guard.isDirty()).toBe(false);
	});

	it('a field edited after the first touch makes the editor dirty', () => {
		const guard = new LeaveGuard();
		const form = makeForm('<input name="title" value="Dîner">');
		guard.touch(form);
		input(form, 'title').value = 'Déjeuner';
		expect(guard.isDirty()).toBe(true);
	});

	it('keeps the first snapshot across later touches', () => {
		const guard = new LeaveGuard();
		const form = makeForm('<input name="title" value="Dîner">');
		guard.touch(form);
		input(form, 'title').value = 'Déjeuner';
		guard.touch(form);
		expect(guard.isDirty()).toBe(true);
	});

	it('putting a field back as it was is not a change', () => {
		const guard = new LeaveGuard();
		const form = makeForm('<input name="title" value="Dîner">');
		guard.touch(form);
		input(form, 'title').value = 'Déjeuner';
		input(form, 'title').value = 'Dîner';
		expect(guard.isDirty()).toBe(false);
	});

	it('a save cleans that form only, until it is edited again', () => {
		const guard = new LeaveGuard();
		const a = makeForm('<input name="title" value="">');
		const b = makeForm('<input name="city" value="">');
		guard.touch(a);
		guard.touch(b);
		input(a, 'title').value = 'Dîner';
		input(b, 'city').value = 'Paris';

		guard.saved(a);
		expect(guard.isDirty()).toBe(true);
		guard.saved(b);
		expect(guard.isDirty()).toBe(false);

		guard.touch(a);
		input(a, 'title').value = 'Déjeuner';
		expect(guard.isDirty()).toBe(true);
	});

	it('clear forgets every form', () => {
		const guard = new LeaveGuard();
		const form = makeForm('<input name="title" value="">');
		guard.touch(form);
		input(form, 'title').value = 'Dîner';
		guard.clear();
		expect(guard.isDirty()).toBe(false);
	});

	it('ignores a form no longer in the page', () => {
		const guard = new LeaveGuard();
		const form = makeForm('<input name="title" value="">');
		guard.touch(form);
		input(form, 'title').value = 'Dîner';
		form.remove();
		expect(guard.isDirty()).toBe(false);
	});
});

describe('announceSaved', () => {
	it('bubbles a saved event from the form', () => {
		const form = makeForm('');
		let target: EventTarget | null = null;
		document.body.addEventListener(EDITOR_SAVED_EVENT, (e) => (target = e.target), { once: true });
		announceSaved(form);
		expect(target).toBe(form);
	});
});
