import { describe, it, expect, afterEach } from 'vitest';
import { showFieldErrors, clearFieldErrors } from '$lib/utils/editor-field-errors';

function makeForm(html: string): HTMLFormElement {
	const form = document.createElement('form');
	form.innerHTML = html;
	document.body.appendChild(form);
	return form;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('showFieldErrors', () => {
	it('shows the message under the named field, invalid and described by it', () => {
		const form = makeForm(
			'<div><input id="timeZone" name="timeZone" aria-describedby="timeZone-help"></div>'
		);
		showFieldErrors(form, 'Le fuseau horaire choisi est invalide.', ['timeZone']);
		const field = form.querySelector<HTMLInputElement>('[name="timeZone"]')!;
		expect(field.getAttribute('aria-invalid')).toBe('true');
		expect(field.getAttribute('aria-describedby')).toBe('timeZone-help timeZone-save-error');
		const message = document.getElementById('timeZone-save-error')!;
		expect(message.textContent).toBe('Non enregistré : Le fuseau horaire choisi est invalide.');
		// Under its field, not anywhere in the form.
		expect(message.parentElement).toBe(field.parentElement);
		expect(message.previousElementSibling).toBe(field);
	});

	it('skips a field the form does not hold', () => {
		const form = makeForm('<input name="timeZone">');
		showFieldErrors(form, 'Refusé.', ['days', 'unknown']);
		expect(form.querySelector('.editor-field-error')).toBeNull();
		expect(document.querySelector('.editor-field-error')).toBeNull();
	});

	it('puts a checkbox message under its box, a radio group under its fieldset', () => {
		const form = makeForm(`
			<div class="box"><input type="checkbox" id="isSpotlight" name="isSpotlight"></div>
			<fieldset><input type="radio" name="visibility" value="public"><input type="radio" name="visibility" value="private"></fieldset>
		`);
		showFieldErrors(form, 'Refusé.', ['isSpotlight', 'visibility']);
		const checkbox = form.querySelector<HTMLInputElement>('[name="isSpotlight"]')!;
		// Under the checkbox's own box, not inside it.
		expect(checkbox.parentElement!.querySelector('.editor-field-error')).toBeNull();
		expect(checkbox.parentElement!.nextElementSibling?.classList.contains('editor-field-error')).toBe(true);
		// Under the radio group's fieldset, once for the whole group.
		const fieldset = form.querySelector('fieldset')!;
		expect(fieldset.querySelector('.editor-field-error')).toBeNull();
		expect(fieldset.nextElementSibling?.classList.contains('editor-field-error')).toBe(true);
		// Every radio of the group is at fault, and hears the same message.
		const radios = [...form.querySelectorAll<HTMLInputElement>('[name="visibility"]')];
		for (const radio of radios) expect(radio.getAttribute('aria-invalid')).toBe('true');
		const described = radios.map((radio) => radio.getAttribute('aria-describedby'));
		expect(described[0]).toBeTruthy();
		expect(described[1]).toBe(described[0]);
		expect(document.getElementById(described[0]!)?.textContent).toBe('Non enregistré : Refusé.');
	});

	it('replaces what an earlier refusal showed', () => {
		const form = makeForm('<input id="a" name="a"><input id="b" name="b">');
		showFieldErrors(form, 'Premier refus.', ['a', 'b']);
		showFieldErrors(form, 'Second refus.', ['b']);
		expect(form.querySelectorAll('.editor-field-error')).toHaveLength(1);
		expect(document.getElementById('b-save-error')!.textContent).toBe('Non enregistré : Second refus.');
		// The field no longer at fault is valid again.
		expect(form.querySelector<HTMLInputElement>('[name="a"]')!.getAttribute('aria-invalid')).toBeNull();
	});
});

describe('clearing a field message', () => {
	it('editing the field clears its message and restores its attributes', () => {
		const form = makeForm('<input id="a" name="a" aria-describedby="a-help"><input id="b" name="b">');
		showFieldErrors(form, 'Refusé.', ['a', 'b']);
		form.querySelector<HTMLInputElement>('[name="a"]')!.dispatchEvent(new Event('input', { bubbles: true }));
		expect(document.getElementById('a-save-error')).toBeNull();
		const a = form.querySelector<HTMLInputElement>('[name="a"]')!;
		expect(a.getAttribute('aria-invalid')).toBeNull();
		expect(a.getAttribute('aria-describedby')).toBe('a-help');
		// The untouched field keeps its message.
		expect(document.getElementById('b-save-error')).not.toBeNull();
	});

	it('clearFieldErrors takes every message away, restoring the fields', () => {
		const form = makeForm('<input name="a"><input name="b">');
		showFieldErrors(form, 'Refusé.', ['a', 'b']);
		clearFieldErrors(form);
		expect(form.querySelectorAll('.editor-field-error')).toHaveLength(0);
		for (const field of form.querySelectorAll<HTMLInputElement>('input')) {
			expect(field.getAttribute('aria-invalid')).toBeNull();
			expect(field.getAttribute('aria-describedby')).toBeNull();
		}
	});
});
