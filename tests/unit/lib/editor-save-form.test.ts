import { describe, it, expect, afterEach } from 'vitest';
import { formTab, reportSave, serializeForm, EDITOR_SAVE_EVENT } from '$lib/utils/editor-save-form';

function makeForm(html: string): HTMLFormElement {
	const form = document.createElement('form');
	form.innerHTML = html;
	document.body.appendChild(form);
	return form;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('serializeForm', () => {
	it('reflects what the form would post', () => {
		const form = makeForm('<input name="a" value="1"><input type="checkbox" name="b">');
		const before = serializeForm(form);
		form.querySelector<HTMLInputElement>('[name="b"]')!.checked = true;
		expect(serializeForm(form)).not.toBe(before);
	});
});

describe('reportSave', () => {
	it('bubbles the outcome from the form', () => {
		const form = makeForm('');
		let detail: unknown = null;
		document.body.addEventListener(EDITOR_SAVE_EVENT, (e) => (detail = (e as CustomEvent).detail), { once: true });
		reportSave(form, { ok: false, reason: 'invalid', message: 'Prix manquant' });
		expect(detail).toEqual({ ok: false, reason: 'invalid', message: 'Prix manquant' });
	});
});

describe('formTab', () => {
	it('posts the form and answers with what the tab reports', async () => {
		const form = makeForm('<input name="title" value="Dîner">');
		const tab = formTab(form);
		let owned = false;
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			owned = tab.owns(e as SubmitEvent);
			queueMicrotask(() => reportSave(form, { ok: true }));
		});
		expect(await tab.submit()).toEqual({ ok: true });
		expect(owned).toBe(true);
	});

	it('a submit event the controller did not start is not its own', () => {
		const form = makeForm('<button type="submit">Enregistrer</button>');
		const tab = formTab(form);
		let owned: boolean | null = null;
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			owned = tab.owns(e as SubmitEvent);
		});
		form.requestSubmit();
		expect(owned).toBe(false);
	});

	it('a form the browser refuses is invalid, without posting', async () => {
		const form = makeForm('<input name="title" required>');
		const tab = formTab(form);
		let posted = false;
		form.addEventListener('submit', (e) => {
			e.preventDefault();
			posted = true;
		});
		expect(await tab.submit()).toEqual({ ok: false, reason: 'invalid' });
		expect(posted).toBe(false);
	});

	it('serializes the form', () => {
		const form = makeForm('<input name="title" value="Dîner">');
		expect(formTab(form).serialize()).toBe(serializeForm(form));
	});
});
