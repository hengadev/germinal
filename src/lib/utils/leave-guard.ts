/**
 * The Event editor's unsaved-changes guard (issue 037).
 *
 * Each tab's form is dirty when what it would post differs from what it
 * held when the Admin first touched it. The snapshot is taken lazily, on
 * the first interaction with the form, so whatever a tab sets up on mount
 * (derived hidden fields, normalised values) never counts as an edit. A
 * successful save forgets the snapshot: the form is clean until touched
 * and changed again. Editing a field then putting it back is not a change.
 */

/** Event a tab's form dispatches (bubbling) once its save went through. */
export const EDITOR_SAVED_EVENT = 'editorsaved';

/** Tell the editor holding `form` that it was saved. */
export function announceSaved(form: HTMLFormElement | null | undefined): void {
	form?.dispatchEvent(new CustomEvent(EDITOR_SAVED_EVENT, { bubbles: true }));
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

export class LeaveGuard {
	private baselines = new Map<HTMLFormElement, string>();

	/** The Admin is about to interact with `form`: remember its state, once. */
	touch(form: HTMLFormElement): void {
		if (!this.baselines.has(form)) this.baselines.set(form, serializeForm(form));
	}

	/** `form` was saved: it is clean again. */
	saved(form: HTMLFormElement): void {
		this.baselines.delete(form);
	}

	/** Forget every form (the editor is being left on purpose). */
	clear(): void {
		this.baselines.clear();
	}

	/** Whether any touched form now holds something it did not. */
	isDirty(): boolean {
		for (const [form, baseline] of this.baselines) {
			if (form.isConnected && serializeForm(form) !== baseline) return true;
		}
		return false;
	}
}
