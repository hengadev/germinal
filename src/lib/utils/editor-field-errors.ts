/**
 * Field-level messages of a refused save (issue 017, ADR 0010).
 *
 * A save action answers with its message and, where known, the names of
 * the fields at fault. `showFieldErrors` puts that message under each
 * named field of the form: the field becomes `aria-invalid` and the
 * message is tied to it by `aria-describedby` — heard with the field,
 * seen under it. Editing the field clears its message (it may have been
 * fixed); the tab keeps its error mark until its save goes through.
 *
 * A name the form does not hold is skipped: its message stays a general
 * one (the header's save status and the toast). Hidden inputs count as
 * fields — the days, Seatings and pricing payloads show their message
 * where they sit, under the Days picker or at the head of their editor.
 */

/** How a message under a field begins, in the editor's voice (issue 019). */
const REFUSED_PREFIX = 'Non enregistré : ';

interface ShownFieldError {
	element: HTMLParagraphElement;
	controls: HTMLElement[];
	/** `aria-invalid` and `aria-describedby` as they were, to restore. */
	invalid: (string | null)[];
	describedBy: (string | null)[];
}

interface FormFieldErrors {
	byName: Map<string, ShownFieldError>;
	/** The clearing listener is on the form once and for all. */
	listening: boolean;
}

const forms = new WeakMap<HTMLFormElement, FormFieldErrors>();

function stateOf(form: HTMLFormElement): FormFieldErrors {
	let state = forms.get(form);
	if (!state) {
		state = { byName: new Map(), listening: false };
		forms.set(form, state);
	}
	return state;
}

let nextId = 0;

/**
 * Where a field's message goes: right under a lone control; under the
 * group a checkbox or radio belongs to (its box, or the fieldset of a
 * radio group), where the whole choice is read.
 */
function anchorOf(controls: HTMLElement[]): HTMLElement {
	const last = controls[controls.length - 1];
	const type = (last as HTMLInputElement).type;
	if (type === 'checkbox' || type === 'radio') {
		return last.closest('fieldset') ?? last.parentElement ?? last;
	}
	return last;
}

/**
 * Show `message` under each field of `fields` the form holds, replacing
 * whatever an earlier refusal showed there.
 */
export function showFieldErrors(form: HTMLFormElement, message: string, fields: readonly string[]): void {
	const state = stateOf(form);
	clearFieldErrors(form);
	if (!state.listening) {
		state.listening = true;
		// Fixing the field clears its message (issue 017).
		form.addEventListener('input', (domEvent) => {
			const name = domEvent.target instanceof Element ? domEvent.target.getAttribute('name') : null;
			if (name) clearFieldError(form, name);
		});
	}
	for (const name of fields) {
		const found = form.elements.namedItem(name);
		const controls = (
			found === null ? [] : found instanceof Element ? [found] : [...(found as RadioNodeList)]
		).filter((control): control is HTMLElement => control instanceof HTMLElement);
		if (controls.length === 0) continue;

		const error = document.createElement('p');
		error.className = 'editor-field-error mt-1 text-xs text-red-700';
		error.textContent = `${REFUSED_PREFIX}${message}`;
		const anchor = anchorOf(controls);
		error.id = controls[0].id !== '' ? `${controls[0].id}-save-error` : `editor-field-error-${nextId++}`;
		anchor.insertAdjacentElement('afterend', error);

		const shown: ShownFieldError = { element: error, controls, invalid: [], describedBy: [] };
		for (const control of controls) {
			shown.invalid.push(control.getAttribute('aria-invalid'));
			shown.describedBy.push(control.getAttribute('aria-describedby'));
			control.setAttribute('aria-invalid', 'true');
			const described = control.getAttribute('aria-describedby');
			control.setAttribute('aria-describedby', described ? `${described} ${error.id}` : error.id);
		}
		state.byName.set(name, shown);
	}
}

/** Take every field message of `form` away, restoring the fields. */
export function clearFieldErrors(form: HTMLFormElement): void {
	for (const name of [...stateOf(form).byName.keys()]) clearFieldError(form, name);
}

function clearFieldError(form: HTMLFormElement, name: string): void {
	const shown = forms.get(form)?.byName.get(name);
	if (!shown) return;
	forms.get(form)?.byName.delete(name);
	shown.element.remove();
	shown.controls.forEach((control, i) => {
		const invalid = shown.invalid[i];
		if (invalid === null) control.removeAttribute('aria-invalid');
		else control.setAttribute('aria-invalid', invalid);
		const describedBy = shown.describedBy[i];
		if (describedBy === null) control.removeAttribute('aria-describedby');
		else control.setAttribute('aria-describedby', describedBy);
	});
}
