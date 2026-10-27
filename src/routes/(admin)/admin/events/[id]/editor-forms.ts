import { invalidateAll } from '$app/navigation';
import { tick } from 'svelte';
import type { ActionResult } from '@sveltejs/kit';
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
 * through is `failed`.
 */
export function saveOutcomeOf(result: ActionResult): SaveOutcome {
	if (result.type === 'success' || result.type === 'redirect') return { ok: true };
	if (result.type === 'failure') {
		const message = (result.data as { error?: string } | undefined)?.error;
		return { ok: false, reason: result.status < 500 ? 'invalid' : 'failed', message };
	}
	return { ok: false, reason: 'failed' };
}

/** Marks a tab panel whose forms save themselves (a Draft's, issue 018). */
export const AUTOSAVE_ATTRIBUTE = 'data-editor-autosave';

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
		await invalidateAll();
		if (refresh) {
			refresh();
			// The form posts what the DOM holds: let the refresh reach it.
			await tick();
		}
		reportSave(form, { ok: true });
		return true;
	}
	if (result.type === 'failure') {
		toast.error('Erreur', (result.data as { error?: string } | undefined)?.error ?? 'Une erreur est survenue');
	} else if (result.type === 'error') {
		toast.error('Erreur', 'Une erreur est survenue');
	}
	reportSave(form, saveOutcomeOf(result));
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
