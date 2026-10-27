/**
 * The Event editor's forms, seen by its save controller (issue 016).
 *
 * A tab's form saves through SvelteKit's `enhance`; the controller only
 * knows `serialize()` and `submit()`. `formTab` bridges the two: submitting
 * posts the form, and the tab answers how it went with `reportSave` once
 * its result is handled (or once it refused to send anything).
 */
import type { EditorTab, SaveOutcome } from './editor-save';

/** Event a tab's form dispatches (bubbling) with how its save went. */
export const EDITOR_SAVE_EVENT = 'editorsave';

/** Tell the editor holding `form` how its save went. */
export function reportSave(form: HTMLFormElement | null | undefined, outcome: SaveOutcome): void {
	form?.dispatchEvent(new CustomEvent<SaveOutcome>(EDITOR_SAVE_EVENT, { bubbles: true, detail: outcome }));
}

/** What `form` would post, as a comparable string. */
export function serializeForm(form: HTMLFormElement): string {
	const entries: [string, string][] = [];
	for (const [name, value] of new FormData(form)) {
		entries.push([
			name,
			typeof value === 'string' ? value : `file:${value.name}:${value.size}:${value.lastModified}`,
		]);
	}
	return JSON.stringify(entries);
}

export interface FormTab extends EditorTab {
	/** Whether this `submit` event is the controller's own (let it through). */
	owns(submitEvent: SubmitEvent): boolean;
	/** Remember the button the Admin pressed, for the controller's post. */
	setSubmitter(submitter: HTMLElement | null): void;
}

/**
 * `form` as a controller tab. `submit()` posts it (constraint validation
 * included: a form the browser refuses is `invalid`) and resolves with
 * the outcome the tab reports.
 */
export function formTab(form: HTMLFormElement): FormTab {
	let submitter: HTMLElement | null = null;
	let posting = false;
	let passed = false;
	let settle: ((outcome: SaveOutcome) => void) | null = null;

	form.addEventListener(EDITOR_SAVE_EVENT, (domEvent) => {
		const outcome = (domEvent as CustomEvent<SaveOutcome>).detail;
		const resolve = settle;
		settle = null;
		resolve?.(outcome);
	});
	form.addEventListener('submit', () => (passed = posting || passed), { capture: true });

	return {
		serialize: () => serializeForm(form),
		owns(submitEvent) {
			return posting && submitEvent.target === form;
		},
		setSubmitter(element) {
			submitter = element;
		},
		submit() {
			return new Promise<SaveOutcome>((resolve) => {
				settle = resolve;
				posting = true;
				passed = false;
				const button = submitter && submitter.isConnected && form.contains(submitter) ? submitter : null;
				submitter = null;
				try {
					form.requestSubmit(button ?? undefined);
				} finally {
					posting = false;
				}
				// The browser refused the form (a required field, say) and
				// showed why: nothing was sent.
				if (!passed && settle === resolve) {
					settle = null;
					resolve({ ok: false, reason: 'invalid' });
				}
			});
		},
	};
}
