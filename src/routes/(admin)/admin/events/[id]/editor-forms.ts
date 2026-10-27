import { invalidateAll } from '$app/navigation';
import { tick } from 'svelte';
import type { ActionResult } from '@sveltejs/kit';
import { clearFieldErrors, showFieldErrors } from '$lib/utils/editor-field-errors';
import { reportSave } from '$lib/utils/editor-save-form';
import type { SaveOutcome } from '$lib/utils/editor-save';

/**
 * Shared by the Event editor's tabs (issue 036). Each tab posts its own
 * form, always on a saved Event (ADR 0010).
 */

interface Toast {
	success: (title: string, message: string) => void;
	error: (title: string, message: string) => void;
}

/**
 * How a save action answered, for the editor's save controller (issue
 * 016): a refusal (4xx) is `invalid`, anything else that did not go
 * through is `failed`. Both carry the action's message and, where it
 * names them (issue 017), the fields at fault.
 */
export function saveOutcomeOf(result: ActionResult): SaveOutcome {
	if (result.type === 'success' || result.type === 'redirect') return { ok: true };
	if (result.type === 'failure') {
		const data = result.data as { error?: string; fields?: unknown } | undefined;
		const fields = Array.isArray(data?.fields)
			? data.fields.filter((field): field is string => typeof field === 'string')
			: undefined;
		return {
			ok: false,
			reason: result.status < 500 ? 'invalid' : 'failed',
			message: data?.error,
			...(fields && fields.length > 0 ? { fields } : {}),
		};
	}
	return { ok: false, reason: 'failed' };
}

/** Marks a tab panel whose forms save themselves (a Draft's, issue 018). */
export const AUTOSAVE_ATTRIBUTE = 'data-editor-autosave';

/** Marks the editor's root: a save of all its tabs is batched on it. */
export const EDITOR_ROOT_ATTRIBUTE = 'data-editor-root';

// Refreshes put off until a save of every held tab is over (issue 020),
// per editor root (the admin layout mounts the editor twice).
const batches = new WeakMap<Element, (() => void)[]>();

/**
 * A published Event's tabs are about to be saved all at once (issue 020):
 * until `finishSaveBatch`, a tab of `root` saved does not reload the page
 * data, so the whole save refreshes once.
 */
export function startSaveBatch(root: Element): void {
	batches.set(root, []);
}

/**
 * The save of every held tab is over: reload the page data once — if
 * anything was saved — then let each saved tab take back what the server
 * made of it.
 */
export async function finishSaveBatch(root: Element, anySaved: boolean): Promise<void> {
	const refreshes = batches.get(root) ?? [];
	batches.delete(root);
	if (!anySaved) return;
	await invalidateAll();
	for (const refresh of refreshes) refresh();
	await tick();
}

/**
 * A tab of `form` was saved: reload the page data, then run `refresh` —
 * or, during a save of every held tab, leave both to its end.
 */
export async function refreshAfterSave(form: HTMLFormElement | undefined, refresh?: () => void): Promise<void> {
	const root = form?.closest(`[${EDITOR_ROOT_ATTRIBUTE}]`);
	const pending = root ? batches.get(root) : undefined;
	if (pending) {
		if (refresh) pending.push(refresh);
		return;
	}
	await invalidateAll();
	if (refresh) {
		refresh();
		// The form posts what the DOM holds: let the refresh reach it.
		await tick();
	}
}

/**
 * Answer a tab's save: a toast, then fresh data. Returns whether the save
 * went through (so the tab can reset its drafts). Reports the outcome on
 * `form` to the editor's save controller (issue 016).
 *
 * A form that saves itself (issue 018) gets no success toast: the header's
 * save status says it, unless the save went through with a warning (the
 * English could not be translated). Errors always show.
 *
 * `refresh` takes back from the fresh data what the server made of the save
 * (generated English). It runs before the controller hears of the save, so
 * a follow-up save posts the refreshed form, never the stale one.
 */
export async function handleTabResult(
	result: ActionResult,
	toast: Toast,
	successFallback: string,
	form?: HTMLFormElement,
	refresh?: () => void
): Promise<boolean> {
	if (result.type === 'success') {
		const data = result.data as { success?: string; translationFailed?: boolean } | undefined;
		const quiet = form?.closest(`[${AUTOSAVE_ATTRIBUTE}]`) != null && !data?.translationFailed;
		if (!quiet) toast.success('Succès', data?.success ?? successFallback);
		await refreshAfterSave(form, refresh);
		reportSave(form, { ok: true });
		if (form) clearFieldErrors(form);
		return true;
	}
	if (result.type === 'failure') {
		toast.error('Erreur', (result.data as { error?: string } | undefined)?.error ?? 'Une erreur est survenue');
	} else if (result.type === 'error') {
		toast.error('Erreur', 'Une erreur est survenue');
	}
	const outcome = saveOutcomeOf(result);
	// A refusal that names its fields shows under them (issue 017); any
	// other answer clears what an earlier refusal showed there.
	if (form && !outcome.ok && outcome.fields !== undefined) {
		showFieldErrors(form, outcome.message ?? 'Une erreur est survenue', outcome.fields);
	} else if (form) {
		clearFieldErrors(form);
	}
	reportSave(form, outcome);
	return false;
}

/** The saved Event as the editor's tabs read it. */
export interface EditorEvent {
	id: string;
	titleEn: string | null;
	titleFr: string | null;
	subtitleEn: string | null;
	subtitleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	locationEn: string | null;
	locationFr: string | null;
	venueNameEn: string | null;
	venueNameFr: string | null;
	streetAddressEn: string | null;
	streetAddressFr: string | null;
	districtEn: string | null;
	districtFr: string | null;
	cityEn: string | null;
	cityFr: string | null;
	postalCode: string | null;
	countryEn: string | null;
	countryFr: string | null;
	timeZone: string;
	collaborators: string | null;
	timings: string | null;
	curatorEn: string | null;
	curatorFr: string | null;
	admissionInfoEn: string | null;
	admissionInfoFr: string | null;
	/** Internal Notes (issue 039): only Admins ever see them. */
	internalNotes?: string | null;
	// Practical Info (issue 040): Ticket holders only, never public.
	practicalInfoEn: string | null;
	practicalInfoFr: string | null;
	/** Whether the booking form asks for Dietary Requirements (issue 041). */
	askDietaryRequirements?: boolean;
	/** The Recap (issue 045), for the Portfolio project page. */
	recapEn?: string | null;
	recapFr?: string | null;
	/** Visuals and Event Photos alike (issue 045); each tab reads its own. */
	media?: import('$lib/types/media').Media[] | null;
	visibility: 'draft' | 'private' | 'public';
	isSpotlight: boolean | null;
	isPortfolio: boolean | null;
}
